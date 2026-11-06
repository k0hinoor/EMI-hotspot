/*
 * EMI Hotspot Mapper — ESP32-CAM node firmware
 * =============================================
 *
 * The ESP32-CAM is the sensor head of the system: it sees the board and it reads
 * the EMI detector, then it pushes both over one WebSocket so the dashboard never
 * has to guess what was true when a frame was captured.
 *
 *   ESP32-CAM ── ADC (detector envelope) ─┐
 *             └─ OV2640 camera ───────────┴─► WebSocket ─► dashboard (:81/stream)
 *
 * Wire format (one message per frame, meta then picture):
 *
 *   "#CAM {"seq":418,"fw":"esp32cam-1.1.0","signal_raw":1180,"signal_filtered":1152,
 *          "status":"VALID","probe":"E","w":640,"h":480,"fps":12,"samples":32}"
 *   <binary JPEG>
 *
 * The meta line carries the detector reading that was live for THAT frame, so a
 * measurement and its picture always agree. The same text protocol is mirrored on
 * the USB serial port (`#HELLO`, `#DATA`, …) for a machine that has no Wi-Fi.
 *
 * Board: AI-Thinker ESP32-CAM (OV2640, no USB-serial on board — use the adapter).
 *
 *   Detector envelope ──► GPIO 13 (ADC2_CH4)   [see ADC note below]
 *   Status LED        ──► GPIO 33 (active low, flash)
 *   Probe switch      ──► GPIO 12 → GND = H-field, open = E-field
 *
 * ADC NOTE — ADC2 is shared with the Wi-Fi radio on the ESP32. While the camera
 * and the radio are running, ADC2 reads are unreliable, which is exactly why the
 * stock examples only use ADC1. This sketch therefore samples on GPIO 13 only as
 * a fallback: for reliable readings feed the detector into GPIO 2 (ADC1_CH2) or
 * GPIO 15 (ADC1_CH3) instead and change `DETECTOR_PIN` below. Readings that fall
 * outside the configured range are reported, never smoothed away.
 *
 * Libraries: ESP32 board support 2.0.x/3.x (esp32-camera is bundled).
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include "esp_camera.h"
#include "esp_timer.h"

/* ------------------------------- configuration ---------------------------- */

static const char *FIRMWARE_VERSION = "esp32cam-1.1.0";
static const char *PROTOCOL_VERSION_STR = "1";

/** Detector envelope input. See the ADC note above — ADC1 pins are preferred. */
static const int DETECTOR_PIN = 13;

/** Probe identity switch: closed to GND = H-field, open = E-field. */
static const int PROBE_SELECT_PIN = 12;

/** On-board flash LED (active low). */
static const int FLASH_LED_PIN = 33;

/** Wi-Fi: set to your credentials, or leave empty to start an access point. */
static const char *WIFI_SSID = "";
static const char *WIFI_PASSWORD = "";

/** Access-point fallback so the module is always reachable in the field. */
static const char *AP_SSID = "EMI-HOTSPOT-CAM";
static const char *AP_PASSWORD = "emihotspot";

/** How the module identifies itself in #HELLO. */
static const char *DEVICE_ID = "EMI-CAM-01";

static const uint32_t STREAM_PORT = 81;
static const uint32_t HTTP_PORT = 80;

/* ------------------------------ acquisition ------------------------------- */

struct Acquisition {
  uint16_t adc_max = 4095;
  uint16_t saturated_at = 3900;
  uint16_t averaging = 32;      // samples per reported value
  uint16_t sample_hz = 200;     // detector sampling rate
  uint16_t unstable_pct = 18;   // peak-to-peak spread that counts as unstable
  uint8_t  fps = 12;            // camera frames served per second
  uint8_t  quality = 12;        // JPEG quality (lower = better)
  framesize_t frame_size = FRAMESIZE_VGA;
  uint16_t roi_x = 0;           // optional ROI in sensor pixels
  uint16_t roi_y = 0;
  uint16_t roi_w = 0;
  uint16_t roi_h = 0;
};

static Acquisition acq;
static Preferences prefs;

/* ------------------------------ camera model ------------------------------ */

// AI-Thinker ESP32-CAM pin map (the board shown in the module photo).
static camera_config_t camera_config = {
  .pin_pwdn = 32, .pin_reset = -1, .pin_xclk = 0,
  .pin_sccb_sda = 26, .pin_sccb_scl = 27,
  .pin_d7 = 35, .pin_d6 = 34, .pin_d5 = 39, .pin_d4 = 36,
  .pin_d3 = 21, .pin_d2 = 19, .pin_d1 = 18, .pin_d0 = 5,
  .pin_vsync = 25, .pin_href = 23, .pin_pclk = 22,
  .xclk_freq_hz = 20000000,
  .ledc_timer = LEDC_TIMER_0, .ledc_channel = LEDC_CHANNEL_0,
  .pixel_format = PIXFORMAT_JPEG,
  .frame_size = FRAMESIZE_VGA,
  .jpeg_quality = 12,
  .fb_count = 2,
  .fb_location = CAMERA_FB_IN_PSRAM,
  .grab_mode = CAMERA_GRAB_LATEST,
};

static WebServer http(HTTP_PORT);
static WebSocketsServer ws(STREAM_PORT);

static uint32_t frame_seq = 0;
static bool streaming = true;
static uint32_t last_frame_ms = 0;

/* --------------------------------- detector -------------------------------- */

struct Reading {
  uint16_t raw;
  uint16_t filtered;
  uint16_t spread;
  const char *status;
  uint32_t at_ms;
};

static Reading last_reading = {0, 0, 0, "INVALID", 0};

static const char *classify(uint16_t raw, uint16_t spread) {
  if (raw >= acq.saturated_at) return "SATURATED";
  if (raw == 0) return "INVALID";
  if (last_reading.filtered > 0 &&
      ((uint32_t)spread * 100) / max<uint16_t>(1, last_reading.filtered) > acq.unstable_pct) {
    return "UNSTABLE";
  }
  return "VALID";
}

/**
 * Averages `acq.averaging` samples and keeps the peak-to-peak spread, so an
 * unstable detector is reported instead of being averaged into a quiet number.
 */
static Reading sampleDetector() {
  uint32_t sum = 0;
  uint16_t lo = 4095;
  uint16_t hi = 0;
  uint16_t n = max<uint16_t>(1, acq.averaging);
  for (uint16_t i = 0; i < n; i++) {
    uint16_t v = analogRead(DETECTOR_PIN);
    sum += v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    delayMicroseconds(1000000UL / max<uint16_t>(1, acq.sample_hz) / n);
  }
  Reading r;
  r.raw = (uint16_t)(sum / n);
  r.filtered = r.raw;
  r.spread = hi - lo;
  r.status = classify(r.raw, r.spread);
  r.at_ms = millis();
  last_reading = r;
  return r;
}

static const char *probeName() {
  // Pull-up + switch to GND: closed means H-field.
  return digitalRead(PROBE_SELECT_PIN) == LOW ? "H_FIELD" : "E_FIELD";
}

/* ----------------------------------- help ---------------------------------- */

static void emitHello(Print &out) {
  out.printf("#HELLO {\"device_id\":\"%s\",\"firmware_version\":\"%s\",\"protocol_version\":%s,"
             "\"probe_type\":\"%s\",\"sample_rate_hz\":%u,\"transport\":\"ESP32_CAM\"}\n",
             DEVICE_ID, FIRMWARE_VERSION, PROTOCOL_VERSION_STR, probeName(), acq.sample_hz);
}

static void emitInfo(Print &out) {
  out.printf("#INFO {\"sample_rate_hz\":%u,\"adc_max\":%u,\"saturated_at\":%u,"
             "\"averaging\":%u,\"fps\":%u,\"camera\":\"OV2640\",\"psram\":%s}\n",
             acq.sample_hz, acq.adc_max, acq.saturated_at, acq.averaging, acq.fps,
             psramFound() ? "true" : "false");
}

static const char *framesizeName(framesize_t size) {
  switch (size) {
    case FRAMESIZE_QQVGA: return "QQVGA";
    case FRAMESIZE_QVGA: return "QVGA";
    case FRAMESIZE_CIF: return "CIF";
    case FRAMESIZE_VGA: return "VGA";
    case FRAMESIZE_SVGA: return "SVGA";
    case FRAMESIZE_XGA: return "XGA";
    case FRAMESIZE_SXGA: return "SXGA";
    case FRAMESIZE_UXGA: return "UXGA";
    default: return "CUSTOM";
  }
}

static framesize_t framesizeFromName(const String &name) {
  if (name.equalsIgnoreCase("QQVGA")) return FRAMESIZE_QQVGA;
  if (name.equalsIgnoreCase("QVGA")) return FRAMESIZE_QVGA;
  if (name.equalsIgnoreCase("CIF")) return FRAMESIZE_CIF;
  if (name.equalsIgnoreCase("SVGA")) return FRAMESIZE_SVGA;
  if (name.equalsIgnoreCase("XGA")) return FRAMESIZE_XGA;
  return FRAMESIZE_VGA;
}

/* -------------------------------- persistence ------------------------------ */

static void loadConfig() {
  prefs.begin("emi", true);
  acq.averaging = prefs.getUShort("avg", acq.averaging);
  acq.fps = prefs.getUChar("fps", acq.fps);
  acq.quality = prefs.getUChar("q", acq.quality);
  acq.frame_size = framesizeFromName(prefs.getString("size", "VGA"));
  acq.roi_x = prefs.getUShort("rx", 0);
  acq.roi_y = prefs.getUShort("ry", 0);
  acq.roi_w = prefs.getUShort("rw", 0);
  acq.roi_h = prefs.getUShort("rh", 0);
  prefs.end();
}

static void saveConfig() {
  prefs.begin("emi", false);
  prefs.putUShort("avg", acq.averaging);
  prefs.putUChar("fps", acq.fps);
  prefs.putUChar("q", acq.quality);
  prefs.putString("size", framesizeName(acq.frame_size));
  prefs.putUShort("rx", acq.roi_x);
  prefs.putUShort("ry", acq.roi_y);
  prefs.putUShort("rw", acq.roi_w);
  prefs.putUShort("rh", acq.roi_h);
  prefs.end();
}

/* --------------------------------- camera ---------------------------------- */

static bool initCamera() {
  camera_config.frame_size = acq.frame_size;
  camera_config.jpeg_quality = acq.quality;
  if (esp_camera_init(&camera_config) != ESP_OK) {
    Serial.println("#ERR {\"code\":\"CAMERA_INIT\",\"message\":\"OV2640 did not initialise\"}");
    return false;
  }
  sensor_t *sensor = esp_camera_sensor_get();
  // Keep the sensor honest: no auto gain jumps, no auto white-balance drift.
  sensor->set_gain_ctrl(sensor, 0);
  sensor->set_exposure_ctrl(sensor, 0);
  sensor->set_whitebal(sensor, 0);
  sensor->set_awb_gain(sensor, 0);
  sensor->set_brightness(sensor, 0);
  sensor->set_hmirror(sensor, 0);
  sensor->set_vflip(sensor, 0);
  if (acq.roi_w > 0 && acq.roi_h > 0) {
    sensor->set_res_raw(sensor, 0, 0, 0, 0, acq.roi_x, acq.roi_y, acq.roi_w, acq.roi_h, false, false, false, false, false);
  }
  return true;
}

/** One frame with the reading that was live for it — meta first, then JPEG. */
static void serviceStream() {
  if (!streaming || ws.connectedClients() == 0) return;
  const uint32_t interval = 1000UL / max<uint8_t>(1, acq.fps);
  if (millis() - last_frame_ms < interval) return;
  last_frame_ms = millis();

  Reading r = sampleDetector();
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("#ERR {\"code\":\"FRAME_DROP\",\"message\":\"Camera returned no frame buffer\"}");
    return;
  }

  char meta[320];
  int len = snprintf(meta, sizeof(meta),
                     "#CAM {\"seq\":%lu,\"fw\":\"%s\",\"signal_raw\":%u,\"signal_filtered\":%u,"
                     "\"spread\":%u,\"status\":\"%s\",\"probe\":\"%s\",\"w\":%u,\"h\":%u,"
                     "\"fps\":%u,\"samples\":%u,\"bytes\":%u,\"uptime_ms\":%lu}",
                     (unsigned long)++frame_seq, FIRMWARE_VERSION, r.raw, r.filtered, r.spread,
                     r.status, probeName(), fb->width, fb->height, acq.fps, acq.averaging,
                     (unsigned)fb->len, (unsigned long)millis());
  ws.broadcastTXT(meta, len);
  ws.broadcastTXT(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

/* ------------------------------- web plumbing ------------------------------ */

/**
 * MJPEG fallback for clients that cannot use WebSocket (the stock
 * `http://<ip>:81/stream` shape). Served on :81 as well, so one URL family.
 */
static void handleMjpeg() {
  WiFiClient client = http.client();
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: multipart/x-mixed-replace; boundary=frame");
  client.println();
  streaming = true;
  while (client.connected() && streaming) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) break;
    client.print("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ");
    client.print(fb->len);
    client.print("\r\n\r\n");
    client.write(fb->buf, fb->len);
    client.print("\r\n");
    esp_camera_fb_return(fb);
    delay(1000UL / max<uint8_t>(1, acq.fps));
  }
}

static void handleStatus() {
  Reading r = last_reading;
  char body[420];
  snprintf(body, sizeof(body),
           "{\"device_id\":\"%s\",\"firmware\":\"%s\",\"probe\":\"%s\",\"signal_raw\":%u,"
           "\"status\":\"%s\",\"fps\":%u,\"size\":\"%s\",\"ws_clients\":%u,\"uptime_ms\":%lu}",
           DEVICE_ID, FIRMWARE_VERSION, probeName(), r.raw, r.status, acq.fps,
           framesizeName(acq.frame_size), (unsigned)ws.connectedClients(), (unsigned long)millis());
  http.send(200, "application/json", body);
}

/** `/config?fps=15&size=SVGA&avg=64&quality=10` — applied and persisted. */
static void handleConfig() {
  if (http.hasArg("fps")) acq.fps = constrain(http.arg("fps").toInt(), 1, 25);
  if (http.hasArg("avg")) acq.averaging = constrain(http.arg("avg").toInt(), 1, 512);
  if (http.hasArg("quality")) acq.quality = constrain(http.arg("quality").toInt(), 4, 60);
  if (http.hasArg("size")) acq.frame_size = framesizeFromName(http.arg("size"));
  if (http.hasArg("rx")) acq.roi_x = http.arg("rx").toInt();
  if (http.hasArg("ry")) acq.roi_y = http.arg("ry").toInt();
  if (http.hasArg("rw")) acq.roi_w = http.arg("rw").toInt();
  if (http.hasArg("rh")) acq.roi_h = http.arg("rh").toInt();
  sensor_t *sensor = esp_camera_sensor_get();
  if (sensor) {
    sensor->set_framesize(sensor, acq.frame_size);
    sensor->set_quality(sensor, acq.quality);
  }
  saveConfig();
  handleStatus();
}

static void handleCapture() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    http.send(503, "application/json", "{\"error\":\"no frame\"}");
    return;
  }
  http.send_P(200, "image/jpeg", (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

/* --------------------------------- web socket ------------------------------ */

static void onWsEvent(uint8_t client, WStype_t type, uint8_t *payload, size_t length) {
  if (type == WStype_CONNECTED) {
    Serial.printf("#INFO client %u connected\n", client);
    emitHello(ws);
    emitInfo(ws);
    return;
  }
  if (type == WStype_DISCONNECTED) {
    Serial.printf("#INFO client %u disconnected\n", client);
    return;
  }
  if (type != WStype_TEXT) return;

  // Commands arrive as JSON: {"cmd":"config","fps":12,"size":"VGA"} …
  String text((const char *)payload, length);
  if (text.indexOf("\"config\"") >= 0) {
    int at = text.indexOf("\"fps\"");
    if (at >= 0) acq.fps = constrain(text.substring(text.indexOf(':', at) + 1).toInt(), 1, 25);
    int sizeAt = text.indexOf("\"resolution\"");
    if (sizeAt < 0) sizeAt = text.indexOf("\"size\"");
    if (sizeAt >= 0) {
      int q1 = text.indexOf('"', text.indexOf(':', sizeAt) + 1);
      int q2 = text.indexOf('"', q1 + 1);
      if (q1 > 0 && q2 > q1) acq.frame_size = framesizeFromName(text.substring(q1 + 1, q2));
    }
    sensor_t *sensor = esp_camera_sensor_get();
    if (sensor) {
      sensor->set_framesize(sensor, acq.frame_size);
      sensor->set_quality(sensor, acq.quality);
    }
    saveConfig();
  } else if (text.indexOf("\"stop\"") >= 0) {
    streaming = false;
  } else if (text.indexOf("\"start\"") >= 0) {
    streaming = true;
  } else if (text.indexOf("\"reading\"") >= 0) {
    Reading r = sampleDetector();
    char line[160];
    snprintf(line, sizeof(line), "#DATA {\"seq\":%lu,\"signal_raw\":%u,\"signal_filtered\":%u,\"sample_count\":%u,\"status\":\"%s\",\"probe_type\":\"%s\"}",
             (unsigned long)frame_seq, r.raw, r.filtered, acq.averaging, r.status, probeName());
    ws.broadcastTXT(line, strlen(line));
    Serial.println(line);
  }
}

/* ---------------------------------- network -------------------------------- */

static void connectNetwork() {
  if (strlen(WIFI_SSID) > 0) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.printf("#INFO joining \"%s\"\n", WIFI_SSID);
    for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(500);
  }
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    Serial.printf("#INFO access point \"%s\"\n", AP_SSID);
  }
  Serial.printf("#INFO ip %s\n", WiFi.localIP().toString().c_str());
  if (MDNS.begin("emi-cam")) Serial.println("#INFO mdns emi-cam.local");
  MDNS.addService("http", "tcp", HTTP_PORT);
}

/* ----------------------------------- setup --------------------------------- */

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, HIGH);  // off (active low)
  pinMode(PROBE_SELECT_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  loadConfig();
  connectNetwork();

  if (!initCamera()) {
    Serial.println("#ERR {\"code\":\"CAMERA_INIT\",\"message\":\"Camera unavailable — detector stream still runs\"}");
  }

  emitHello(Serial);
  emitInfo(Serial);

  http.on("/", HTTP_GET, handleStatus);
  http.on("/status", HTTP_GET, handleStatus);
  http.on("/config", HTTP_GET, handleConfig);
  http.on("/capture", HTTP_GET, handleCapture);
  http.on("/stream", HTTP_GET, handleMjpeg);
  http.begin();

  ws.begin();
  ws.onEvent(onWsEvent);
  Serial.printf("#INFO websocket ws://%s:%u/stream\n", WiFi.localIP().toString().c_str(), STREAM_PORT);
}

/* ----------------------------------- loop ---------------------------------- */

void loop() {
  ws.loop();
  http.handleClient();
  serviceStream();

  // Mirror the detector to USB so a laptop can log readings with no Wi-Fi.
  static uint32_t last_serial_ms = 0;
  if (millis() - last_serial_ms > 500) {
    last_serial_ms = millis();
    Reading r = sampleDetector();
    char line[160];
    snprintf(line, sizeof(line), "#DATA {\"seq\":%lu,\"signal_raw\":%u,\"signal_filtered\":%u,\"sample_count\":%u,\"status\":\"%s\",\"probe_type\":\"%s\"}",
             (unsigned long)++frame_seq, r.raw, r.filtered, acq.averaging, r.status, probeName());
    Serial.println(line);
    digitalWrite(FLASH_LED_PIN, r.status[0] == 'V' ? HIGH : LOW);
  }
}
