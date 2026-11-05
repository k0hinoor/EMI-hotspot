# EMI Hotspot Mapper --- Product Requirements Document (PRD)

**Document version:** 1.0\
**Project status:** Prototype planning / initial development\
**Product type:** Hardware-assisted electromagnetic interference (EMI)
analysis and mapping system\
**Target platforms:** Web application and Windows desktop application\
**Primary interaction model:** Manual, grid-based probe scanning\
**Visual direction:** Dark laboratory instrumentation interface

------------------------------------------------------------------------

## 1. Product Overview

### 1.1 Product vision

EMI Hotspot Mapper is a hardware-assisted tool for detecting, recording,
visualizing, and comparing relative electromagnetic-field activity
around electronic circuits and printed circuit boards (PCBs).

The system uses two interchangeable passive probes:

-   **E-field probe:** a short monopole-style probe intended to detect
    electric-field coupling.
-   **H-field probe:** a small loop probe intended to detect
    magnetic-field coupling.

A detector circuit and microcontroller acquire the probe signal and
transmit measurements to a desktop or browser-based dashboard. The user
moves the probe manually over a defined scan area and records
measurements at known grid coordinates. The application visualizes the
recorded measurements as a spatial heatmap and provides tools for
reviewing, comparing, and exporting scan data.

### 1.2 Core value proposition

The product should make it possible to:

1.  Identify locations with comparatively strong detected E-field or
    H-field activity.
2.  Record measurements at repeatable physical coordinates.
3.  Visualize spatial variations using a grid-based heatmap.
4.  Compare E-field and H-field scans.
5.  Preserve measurement history and produce reproducible reports.

### 1.3 Product principles

-   Measurements must be traceable to the physical probe, scan,
    coordinate, timestamp, and acquisition settings.
-   The interface must distinguish measured values from interpolated or
    illustrative values.
-   The application must never fabricate live readings or imply hardware
    is connected when it is not.
-   Measurement units and accuracy claims must reflect the actual
    detector and calibration capabilities.
-   The heatmap and live measurement workflow are the product's primary
    experiences.

------------------------------------------------------------------------

## 2. Goals and Non-Goals

### 2.1 Goals

-   Provide a clear live-monitoring interface for the connected
    detector.
-   Support two interchangeable probes and explicit E-field/H-field
    selection.
-   Support manual grid-based mapping of a PCB or other test area.
-   Display time-series signal information and basic measurement
    statistics.
-   Store scans and individual measurements locally.
-   Compare scans and probe types without mixing incompatible
    measurements.
-   Export scan data and reports.
-   Run as a web application and as a Windows desktop application using
    a shared frontend.

### 2.2 Non-goals for the initial prototype

The initial version is not intended to be:

-   A certified EMI compliance or EMC test instrument.
-   A calibrated field-strength meter unless a suitable calibration
    process and reference equipment are implemented.
-   An automatic position-tracking or robotic scanning system.
-   A full RF spectrum analyzer unless frequency-selective acquisition
    hardware is added.
-   A replacement for laboratory near-field probes and professional EMI
    receivers.

------------------------------------------------------------------------

## 3. Users and Primary Use Cases

### 3.1 Intended users

-   Electronics students and project teams.
-   Makers and hobbyists investigating circuit-level electromagnetic
    activity.
-   Demonstration and exhibition audiences.
-   Users learning practical EMI troubleshooting and measurement
    concepts.

### 3.2 Primary use cases

**UC-01: Monitor a probe signal**\
The user connects the device, selects the active probe type, and views a
live signal reading and time-series graph.

**UC-02: Create a scan area**\
The user creates a scan, enters the test area's dimensions, and chooses
grid spacing.

**UC-03: Record a grid measurement**\
The user moves the probe to a displayed coordinate, waits for a stable
reading, and captures the measurement.

**UC-04: View a heatmap**\
The application renders recorded measurements by coordinate and displays
a legend and measurement coverage.

**UC-05: Compare E-field and H-field scans**\
The user compares scans of the same test area, while the application
preserves probe identity and measurement metadata.

**UC-06: Review and export results**\
The user searches historical measurements, reviews a scan, and exports
CSV or PDF output.

------------------------------------------------------------------------

## 4. Information Architecture

The application contains seven primary navigation sections:

1.  **Live Scan** --- live probe monitoring and measurement capture.
2.  **Heatmap** --- manual grid-based spatial mapping.
3.  **Signal Analysis** --- signal history, statistics, and supported
    analysis.
4.  **Data Log** --- searchable individual measurements and scan
    history.
5.  **Reports** --- report generation and export.
6.  **Calibration** --- probe profiles, baseline adjustment, and
    calibration records.
7.  **Settings** --- hardware connection and application configuration.

The desktop layout uses a persistent left sidebar. Smaller screens use a
collapsible navigation drawer.

------------------------------------------------------------------------

## 5. Design System and Visual Direction

### 5.1 Design concept

A professional dark laboratory-instrument interface inspired by
oscilloscopes, spectrum analyzers, and engineering measurement software.
The interface should feel technical, precise, and readable rather than
like a generic IoT dashboard.

### 5.2 Color tokens

  Token                  Suggested value   Usage
  ---------------------- ----------------- ---------------------------------------
  Primary background     `#090B12`         Application background
  Secondary background   `#111522`         Sidebar and secondary surfaces
  Panel background       `#171C2A`         Cards and workspaces
  Primary accent         `#8B5CF6`         Primary actions and active navigation
  E-field identity       `#38BDF8`         E-field probe identity
  H-field identity       `#C084FC`         H-field probe identity
  Elevated signal        `#F97316`         Elevated relative signal indication
  Strong signal          `#EF4444`         Strong relative signal indication
  Normal status          `#22C55E`         Connected/healthy states
  Border                 `#292F40`         Panel outlines and dividers

Color must not be the only way to communicate status; use text labels
and icons as well.

### 5.3 Typography and components

-   Typography: Inter or Geist.
-   Cards: 10--14 px corner radius.
-   Clear hierarchy between page title, section title, metric, and
    supporting label.
-   Dense technical information should remain readable.
-   Graph axes, units, legends, and status labels must be explicit.
-   Avoid decorative effects that reduce graph or heatmap legibility.

------------------------------------------------------------------------

## 6. Persistent Application Elements

The following elements should remain accessible across primary pages:

1.  Device connection status: Connected, Connecting, or Disconnected.
2.  Active probe identity: E-field, H-field, or Unknown.
3.  Current scan status: Idle, Active, Paused, or Completed.
4.  Data-recording status.
5.  Notifications and warnings.

The header may also show device identifier, firmware version, and
battery status if the hardware actually reports them.

When disconnected, show a clear connection prompt. Do not show simulated
readings as live data.

------------------------------------------------------------------------

## 7. Functional Requirements by Page

## 7.1 Live Scan

### Purpose

Provide the primary live-monitoring experience and allow the user to
capture a measurement at a manually supplied coordinate.

### Required components

-   Page title and live/monitoring status.
-   Device connection indicator.
-   Active probe selector or probe identification.
-   Live raw signal reading.
-   Filtered signal reading, if implemented by firmware.
-   Signal-versus-time graph.
-   Peak reading over a defined interval.
-   Average reading over a defined interval.
-   Baseline/noise-floor estimate, when the calculation is defined.
-   Signal quality indicator: Stable, Unstable, Saturated, or Invalid.
-   Start, Pause, Stop, and Reset controls.
-   Capture Measurement action.
-   Current scan name and status when a scan is active.

### Behaviour

-   The page must distinguish raw and filtered values.
-   Statistics must identify the time window over which they are
    calculated.
-   A captured measurement must include timestamp, probe type, signal
    value, quality status, and coordinate if supplied.
-   The application must indicate stale data if updates stop arriving.
-   Saturated or invalid measurements must not be silently treated as
    valid.

### Initial prototype scope

Live signal monitoring, a time-series graph, probe selection, connection
status, and manual measurement capture.

------------------------------------------------------------------------

## 7.2 Heatmap

### Purpose

Provide spatial visualization of relative detected signal activity over
a manually scanned area. This is the signature product feature.

### Scan setup

The user must be able to:

-   Create and name a scan.
-   Enter board/test-area width and height in millimetres.
-   Choose grid spacing in millimetres.
-   Select E-field or H-field probe mode.
-   Choose a scan orientation or coordinate origin.
-   Review the generated grid before scanning.

### Mapping workspace

The page must include:

-   Central grid/heatmap canvas.
-   X and Y coordinate indicators.
-   Board dimensions and grid spacing.
-   Current selected coordinate.
-   Probe type.
-   Measurement intensity legend.
-   Scan progress and measured-cell count.
-   Capture Measurement action.
-   Re-measure selected cell action.
-   Mark measurement invalid action.
-   Clear/reset scan action.
-   Export heatmap action.

### Grid interaction

-   Selecting a cell displays its coordinate and measurement details.
-   The user manually positions the probe at that coordinate.
-   The user captures a reading after the signal is sufficiently stable.
-   A measured cell displays its recorded value and quality.
-   An unmeasured cell remains visibly unmeasured.
-   Re-measuring a cell must preserve history or clearly record the
    replacement policy.
-   Invalid measurements must remain identifiable and excluded from
    valid summary statistics.

### Heatmap rendering

-   Use a consistent color scale with a visible legend.
-   Support a measured-only view.
-   Optional interpolation may be offered as a separate view.
-   Interpolated regions must be visually distinguished from directly
    measured cells.
-   Never present interpolated values as actual measurements.
-   Allow the user to inspect a cell's exact value, coordinate, probe,
    timestamp, and quality.
-   Heatmap scaling must be documented; comparisons should use a common
    scale when comparing scans.

### Manual mapping workflow

1.  Create a scan and define the test area's dimensions.
2.  Set grid spacing.
3.  Select the probe.
4.  Select the first grid coordinate.
5.  Move the physical probe to that location.
6.  Wait for a stable reading.
7.  Capture the measurement.
8.  Repeat for other coordinates.
9.  Review coverage and invalid/missing cells.
10. Save and optionally compare or export the scan.

### Initial prototype scope

Manual grid creation, coordinate selection, capture, measured-cell
rendering, a legend, scan progress, and scan saving.

------------------------------------------------------------------------

## 7.3 Signal Analysis

### Purpose

Help the user understand how detected signal readings vary over time and
across scans.

### Initial capabilities

-   Signal amplitude versus time.
-   Raw and filtered signal display, where available.
-   Peak and average statistics.
-   Baseline comparison.
-   Signal variation and stability.
-   Measurement interval selection.
-   E-field/H-field scan comparison when compatible data is available.

### Future capabilities

-   Frequency spectrum.
-   Dominant frequency identification.
-   Frequency-band comparison.
-   Harmonic analysis.

**Hardware dependency:** Frequency-domain analysis must remain disabled
or clearly marked unavailable until the detector has suitable
frequency-selective acquisition hardware and sampling capability. A
broadband amplitude detector alone cannot identify frequency components.

------------------------------------------------------------------------

## 7.4 Data Log

### Purpose

Provide a searchable, auditable record of individual measurements.

### Required fields

  Field                 Description
  --------------------- ----------------------------------------
  Reading ID            Unique measurement identifier
  Scan ID               Parent scan
  Probe type            E-field or H-field
  X coordinate          Position in millimetres, if mapped
  Y coordinate          Position in millimetres, if mapped
  Raw signal            ADC count or raw acquired value
  Processed signal      Filtered value, if available
  Unit                  Explicit unit or ADC counts
  Timestamp             Measurement time
  Quality               Valid, Unstable, Saturated, or Invalid
  Calibration profile   Profile used for the measurement

### Required interactions

-   Search by reading ID or scan name.
-   Filter by date range.
-   Filter by scan ID.
-   Filter by probe type.
-   Filter by measurement quality.
-   Sort by timestamp or signal value.
-   Inspect individual measurement details.
-   Export selected or complete data as CSV.
-   Delete records with confirmation and appropriate permissions.

------------------------------------------------------------------------

## 7.5 Reports

### Purpose

Generate reproducible summaries of a scan.

### Report contents

-   Scan name and identifier.
-   Test-area dimensions and grid spacing.
-   Scan date and time.
-   Probe type and probe profile.
-   Device and firmware identifiers, if available.
-   Number of valid, invalid, and missing measurements.
-   Maximum measured signal and its coordinates.
-   Average measured signal and calculation method.
-   Heatmap image and legend.
-   Measurement table.
-   Calibration/baseline information.
-   Notes and annotations.
-   Clear statement of units and measurement limitations.

### Export formats

-   PDF report.
-   CSV measurement data.

Reports must distinguish actual measurements from derived statistics and
interpolated visualization.

------------------------------------------------------------------------

## 7.6 Calibration

### Purpose

Manage probe-specific baseline and calibration information.

### Required capabilities

-   Separate E-field and H-field probe profiles.
-   Probe identifier and physical dimensions.
-   Baseline measurement procedure.
-   Gain configuration, if supported by hardware.
-   Calibration reference and method.
-   Calibration date and operator/note field.
-   Calibration history.
-   Active profile selection.

### Important distinction

Baseline adjustment and gain adjustment do not constitute absolute
field-strength calibration. Absolute field-strength claims require a
suitable reference instrument, defined geometry, frequency response, and
calibration procedure.

The interface must label baseline correction separately from formal
calibration.

------------------------------------------------------------------------

## 7.7 Settings

### Hardware settings

-   USB/serial connection.
-   Available serial ports.
-   Connect and disconnect actions.
-   Baud rate.
-   Device identifier.
-   Firmware version.
-   Communication status and error details.

### Measurement settings

-   Sampling rate, if configurable and reported.
-   Filtering settings, if supported.
-   Measurement averaging window.
-   Signal quality thresholds.
-   Data update interval.

### Application settings

-   Local database/storage location.
-   Display preferences.
-   Graph settings.
-   Export defaults.
-   Application version.
-   About/help information.

------------------------------------------------------------------------

## 8. Probe and Hardware Requirements

### 8.1 Probe architecture

The product uses a shared detector interface with two interchangeable
passive probes.

**E-field probe**

-   Monopole-style exposed copper sensing element.
-   Initial exposed length target: approximately 20 mm.
-   Coaxial connection.
-   Insulated handle.
-   Intended primarily for electric-field coupling.

**H-field probe**

-   Small copper loop.
-   Initial loop diameter target: approximately 10 mm.
-   Coaxial connection.
-   Insulated mechanical support.
-   Intended primarily for magnetic-field coupling.

These are initial fabrication dimensions, not calibrated or guaranteed
performance specifications.

### 8.2 Connector architecture

-   Common connector type for both probes.
-   A single detector input.
-   Probe identity must be selected or reliably detected.
-   Probe-specific acquisition/gain settings may be used after
    characterization.
-   Connector wiring and grounding must be documented.

### 8.3 H-field probe shielding note

A shielded loop requires a deliberate electrical break in the shield at
the sensing region. A continuous conductive shield can behave as a
shorted turn and reduce magnetic sensitivity. The first prototype may
use an unshielded loop for characterization before a shielded version is
finalized.

### 8.4 Hardware safety and test constraints

-   Use low-voltage, enclosed test circuits during development.
-   Do not probe exposed mains conductors.
-   Insulate probe feedpoints and strain-relieve cables.
-   Avoid shorting PCB pads or conductive components with the probe.
-   Validate the probe's response and orientation sensitivity before
    claiming field selectivity.

------------------------------------------------------------------------

## 9. Hardware Communication and Data Pipeline

### 9.1 Proposed pipeline

1.  Probe couples to local electromagnetic activity.
2.  Detector circuit converts the coupled signal into an electrical
    signal.
3.  Microcontroller samples and processes the signal.
4.  Firmware transmits measurement data over USB serial.
5.  Application validates and parses the message.
6.  Application associates the reading with device, probe, scan,
    coordinate, and timestamp.
7.  Live views update and the measurement is stored locally.

### 9.2 Illustrative message format

``` json
{
  "device_id": "EMI-001",
  "probe_type": "E_FIELD",
  "signal_raw": 1842,
  "signal_filtered": 1798,
  "sample_count": 32,
  "status": "VALID"
}
```

The values are illustrative only. The final protocol must match the
firmware and detector capabilities.

### 9.3 Data integrity requirements

-   Validate message structure and field types.
-   Include protocol/version information in the final firmware protocol.
-   Detect stale or missing data.
-   Preserve raw readings when possible.
-   Store units and acquisition configuration with measurements.
-   Record invalid, saturated, or unstable states.
-   Do not infer physical coordinates from the hardware; manual
    coordinates are supplied by the user in this version.

------------------------------------------------------------------------

## 10. Cross-Platform Software Architecture

### 10.1 Architecture principle

Use one shared frontend and shared application logic for the web and
Windows versions. Avoid maintaining two independent user interfaces.

### 10.2 Proposed technology stack

  Layer               Proposed technology
  ------------------- ---------------------------------
  Frontend            React + TypeScript
  Styling             Tailwind CSS
  UI components       shadcn/ui
  Graphs              Apache ECharts
  Heatmap             Custom Canvas or SVG rendering
  Desktop packaging   Tauri
  Web serial          Web Serial API where supported
  Desktop serial      Tauri/native serial integration
  Local database      SQLite
  Data export         CSV and PDF generation

Technology choices may be adjusted during implementation, but the shared
frontend and hardware abstraction boundary should be preserved.

### 10.3 Platform considerations

**Web** - Runs in a supported browser. - Serial access depends on
browser support, permissions, and secure-context requirements. - Provide
clear connection and permission guidance.

**Windows desktop** - Packages the shared frontend. - Uses native serial
access through the desktop integration. - Shares data models,
application logic, and UI components with the web version.

------------------------------------------------------------------------

## 11. Data Model

The local database should be organized around scans and measurement
provenance.

### 11.1 Device

-   `device_id`
-   `firmware_version`
-   `protocol_version`
-   `last_connected_at`
-   `device_metadata`

### 11.2 Probe

-   `probe_id`
-   `probe_type` (E_FIELD or H_FIELD)
-   `connector_type`
-   `physical_dimensions`
-   `profile_id`
-   `created_at`

### 11.3 Scan

-   `scan_id`
-   `scan_name`
-   `board_width_mm`
-   `board_height_mm`
-   `grid_spacing_mm`
-   `probe_id`
-   `started_at`
-   `completed_at`
-   `status`
-   `notes`

### 11.4 Measurement

-   `measurement_id`
-   `scan_id`
-   `probe_id`
-   `x_mm`
-   `y_mm`
-   `signal_raw`
-   `signal_processed`
-   `unit`
-   `timestamp`
-   `quality_status`
-   `calibration_profile_id`
-   `acquisition_metadata`

### 11.5 Calibration profile

-   `profile_id`
-   `probe_id`
-   `baseline_value`
-   `gain_setting`
-   `reference_method`
-   `calibration_date`
-   `notes`

### 11.6 Report

-   `report_id`
-   `scan_id`
-   `created_at`
-   `export_format`
-   `file_metadata`

------------------------------------------------------------------------

## 12. Application States and Error Handling

### 12.1 Device states

-   Disconnected
-   Connecting
-   Connected
-   Communication error

### 12.2 Probe states

-   E-field selected
-   H-field selected
-   Unknown/unidentified

### 12.3 Scan states

-   Idle
-   Active
-   Paused
-   Completed
-   Failed

### 12.4 Signal states

-   Stable
-   Unstable
-   Saturated
-   Stale
-   Invalid

### 12.5 Heatmap states

-   Empty
-   Partial
-   Complete

### 12.6 Required empty and error states

-   No device connected: show connection instructions and no live
    values.
-   No probe selected: request probe selection.
-   No scan created: prompt the user to create a scan.
-   No measurements: show an empty grid, not a fabricated heatmap.
-   Stale data: show the last update time and stale warning.
-   Invalid measurement: visibly mark it and exclude it from valid
    statistics.
-   Export failure: explain the failure and allow retry.
-   Database error: preserve user feedback and avoid claiming data was
    saved.

### 12.7 Demo mode

A clearly labelled Demo Mode may provide sample data for exhibitions and
interface development.

-   Persistent visible DEMO label.
-   Sample data must never be mixed with hardware measurements.
-   Demo scans should be identifiable in history and exports.
-   Leaving Demo Mode must restore the actual hardware connection state.

------------------------------------------------------------------------

## 13. Responsive Design Requirements

### Desktop

Primary target for exhibition and analysis use.

-   Persistent sidebar.
-   Multi-column dashboard layout.
-   Large heatmap canvas.
-   Simultaneous signal graph and metric cards.
-   Full measurement tables and report controls.

### Smaller screens

-   Collapsible navigation.
-   Stacked cards.
-   Touch-friendly controls.
-   Scrollable tables.
-   Heatmap pan/zoom where practical.
-   No loss of access to device and scan status.

### Minimum design target

The desktop interface should remain usable at 1366 × 768 and scale
appropriately to 1920 × 1080.

------------------------------------------------------------------------

## 14. V1.0 Scope and Priorities

### 14.1 V1.0 required features

1.  Application shell and dark design system.
2.  Live Scan page.
3.  E-field/H-field probe selector.
4.  Device connection and status.
5.  Live signal-versus-time graph.
6.  Peak, average, and baseline/noise estimate where defined.
7.  Manual grid-based Heatmap.
8.  Coordinate-based measurement capture.
9.  Measured/unmeasured cell distinction.
10. Hotspot ranking and coordinates.
11. Data Log and scan history.
12. PDF/CSV report export.
13. Probe profiles and baseline adjustment.
14. Hardware and application settings.
15. Demo Mode with clear labelling.
16. Shared web and Windows frontend.

### 14.2 Recommended next-stage features

-   E-field/H-field comparison view.
-   Scan history comparison.
-   PCB image overlay.
-   Measurement annotations.
-   Advanced hotspot ranking and filtering.
-   Improved probe characterization and calibration workflow.

### 14.3 Future hardware-dependent features

-   Frequency spectrum and dominant-frequency analysis.
-   Harmonic analysis.
-   Automated or motorized scanning.
-   Automatic position tracking.
-   3D field visualization.
-   Calibrated field-strength display.

------------------------------------------------------------------------

## 15. Acceptance Criteria

The initial release is acceptable when the following can be
demonstrated:

### Device and live monitoring

-   The application can connect to the supported device interface.
-   It accurately identifies connection/disconnection states.
-   It displays incoming readings without inventing data.
-   It indicates stale, unstable, and saturated measurements.
-   It can capture a measurement with timestamp and probe identity.

### Manual heatmap

-   The user can create a scan area with dimensions and grid spacing.
-   The application generates the expected grid coordinates.
-   The user can select a cell and record a measurement.
-   Captured readings appear in the correct cell.
-   Unmeasured cells remain visually distinct.
-   The user can inspect coordinates and measurement details.
-   The user can save and reopen a scan.

### Data and reporting

-   Measurements retain scan ID, probe, coordinate, timestamp, unit, and
    quality.
-   The user can search/filter measurement history.
-   CSV export contains the underlying measurements and metadata.
-   PDF reports include the heatmap, scan details, summary statistics,
    and limitations.

### Probe comparison

-   E-field and H-field data remain separately identified.
-   The application does not combine incompatible values into a
    misleading common scale.
-   A comparison view clearly labels both probe types and their
    measurement conditions.

### Cross-platform

-   The shared frontend works in the supported web environment.
-   The Windows desktop package can connect through its supported serial
    integration.
-   Both versions use the same scan and measurement data model.

------------------------------------------------------------------------

## 16. Implementation Roadmap

### Milestone 1 --- Foundation and design system

-   Application shell.
-   Sidebar and navigation.
-   Header and persistent status.
-   Theme tokens and reusable components.
-   Responsive layout.

### Milestone 2 --- Live Scan

-   Device connection abstraction.
-   Probe selector.
-   Live signal display.
-   Time-series graph.
-   Measurement capture.
-   Demo data source for development.

### Milestone 3 --- Heatmap engine

-   Scan setup.
-   Board dimensions and grid generation.
-   Coordinate selection.
-   Measurement capture and validation.
-   Heatmap rendering.
-   Scan progress and saving.

### Milestone 4 --- Signal Analysis

-   Signal history.
-   Peak/average calculations.
-   Baseline comparison.
-   E/H comparison foundations.

### Milestone 5 --- Data Management

-   SQLite integration.
-   Scan history.
-   Data Log filters.
-   CSV export.
-   PDF reports.

### Milestone 6 --- Calibration and Settings

-   Probe profiles.
-   Baseline adjustment.
-   Hardware settings.
-   Error and status handling.

### Milestone 7 --- Desktop packaging and validation

-   Tauri integration.
-   Windows serial interface.
-   Web/desktop parity checks.
-   Hardware integration testing.
-   Exhibition demonstration testing.

------------------------------------------------------------------------

## 17. Key Technical Constraints and Risks

1.  **Probe response:** The E-field and H-field probes must be
    experimentally characterized. Their response depends on geometry,
    orientation, frequency, distance, and detector input
    characteristics.
2.  **Relative versus absolute measurements:** Raw ADC counts or
    detector voltage should be used until a defensible calibration
    process exists.
3.  **Frequency analysis:** A broadband detector cannot provide a true
    frequency spectrum without suitable frequency-selective hardware and
    acquisition.
4.  **Manual position accuracy:** Heatmap quality depends on consistent
    probe placement, height, orientation, and grid spacing.
5.  **Comparability:** E-field and H-field readings are different
    measurement types and must not be treated as directly
    interchangeable.
6.  **Interpolation:** Interpolation is a visualization aid, not
    additional measurement data.
7.  **Noise and repeatability:** Baseline, averaging, and stability
    rules must be tested and documented.
8.  **Hardware/software protocol:** Firmware and application message
    formats must be versioned and validated together.

------------------------------------------------------------------------

## 18. Final Product Definition

EMI Hotspot Mapper V1.0 is a dark-themed, cross-platform,
hardware-assisted EMI analysis application built around two
interchangeable probes and a manual spatial scanning workflow.

Its three defining experiences are:

1.  **Live Scan** --- observe and capture probe readings.
2.  **Heatmap** --- locate and visualize relative signal hotspots across
    a manually defined area.
3.  **E/H Comparison** --- investigate differences between
    electric-field and magnetic-field probe measurements.

All other pages---Signal Analysis, Data Log, Reports, Calibration, and
Settings---support these core experiences.

The product must prioritize measurement integrity, repeatability, clear
visualization, and honest communication of hardware limitations.
