# PRISMA ATLAS — User Manual & Step-by-Step Guide

> **Version**: 1.0  
> **Last Updated**: June 2025  
> **System**: PRISMA ATLAS — AI-Powered Pig Farrowing Monitoring System

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
   - [System Requirements](#21-system-requirements)
   - [Logging In](#22-logging-in)
   - [Understanding the Interface](#23-understanding-the-interface)
3. [Dashboard](#3-dashboard)
4. [Live Monitoring](#4-live-monitoring)
5. [Test Pen](#5-test-pen)
6. [Tasks & Cleaning](#6-tasks--cleaning)
7. [Farrowing Management](#7-farrowing-management)
8. [Replay & Simulation](#8-replay--simulation)
9. [Alerts](#9-alerts)
10. [Event Logs](#10-event-logs)
11. [Sow Profiles](#11-sow-profiles)
12. [Camera Setup](#12-camera-setup)
13. [Pen Monitor (Individual Pen)](#13-pen-monitor-individual-pen)
14. [Settings](#14-settings)
15. [AI Detection System](#15-ai-detection-system)
16. [Common Workflows](#16-common-workflows)
17. [Troubleshooting](#17-troubleshooting)
18. [Glossary](#18-glossary)

---

## 1. Introduction

**PRISMA ATLAS** is an AI-powered pig farrowing monitoring system designed to help swine farm workers and managers detect, monitor, and respond to critical events during the farrowing process. The system uses real-time computer vision (YOLOv8/YOLOv11) to:

- **Detect pigs** — Identify sows and piglets in camera feeds
- **Classify sow posture** — Standing, sitting, sleeping, lactating, feeding
- **Assess crushing risk** — Calculate the probability that a sow may overlay piglets
- **Monitor farrowing** — Track the entire farrowing lifecycle from prediction to weaning
- **Generate alerts** — Notify farm workers of critical events in real time
- **Log behavior** — Build historical analytics for each pen and sow

The system operates with a **dual AI pipeline**: an in-browser ONNX model for instant zero-latency detection, and a server-side YOLO model for centralized processing.

---

## 2. Getting Started

### 2.1 System Requirements

| Component | Requirement |
|-----------|-------------|
| Browser | Google Chrome (recommended), Firefox, or Edge — latest version |
| Screen | 1280×720 minimum; 1920×1080 recommended |
| Network | LAN access to the PRISMA ATLAS server |
| Cameras | IP cameras supporting RTSP (see [Camera Setup](#12-camera-setup) for supported brands) |

### 2.2 Logging In

1. Open your browser and navigate to the PRISMA ATLAS URL (default: `http://localhost:3000`).
2. You will see the **Login** page with a branded gradient background.
3. Enter your **Username** and **Password**.
   - Demo credentials are displayed on the login page: `admin` / `admin123`
4. Click the **eye icon** next to the password field to toggle password visibility if needed.
5. Click **Sign In**.
6. Upon successful login, you will be redirected to the **Dashboard**.

> **Note**: If you were trying to access a specific page before logging in, you will be redirected to that page after authentication.

### 2.3 Understanding the Interface

The application uses a **sidebar navigation** layout:

| Element | Description |
|---------|-------------|
| **Sidebar** (left) | Main navigation menu with icons and labels for each page |
| **Top Bar** | Displays the current page title and an **alert bell** icon showing unread alert count |
| **User Profile** (sidebar bottom) | Shows your username and role; click to access settings or log out |
| **Main Content** (center) | The active page content |

**Navigation Pages:**

| Icon | Label | Purpose |
|------|-------|---------|
| 📊 | Dashboard | Farm overview and key metrics |
| 📹 | Live Monitoring | Multi-camera grid with AI overlay |
| 🎬 | Test Pen | Upload video/image for offline AI detection |
| 📋 | Tasks | Task management and cleaning schedule |
| ❤️ | Farrowing | Farrowing lifecycle management |
| 👁️ | Replay | Play back recorded behavior data |
| 🔔 | Alerts | View and manage alerts |
| 📝 | Event Logs | Detection and system event history |
| 👥 | Sow Profiles | Sow record management |
| 📷 | Camera Setup | Camera configuration wizard |
| ⚙️ | Settings | Application preferences |

---

## 3. Dashboard

The **Dashboard** is your central command center, providing a comprehensive overview of the entire farm at a glance.

### Step-by-Step Walkthrough

1. **Navigate** to the Dashboard by clicking **Dashboard** in the sidebar (or it loads automatically after login).

2. **Review the Stats Grid** at the top:
   - **Total Sows** — Number of sows in the system
   - **Nursing Sows** — Sows currently lactating
   - **Total Piglets** — Count across all pens
   - **Active Alerts** — Unresolved alerts requiring attention
   - **Critical Alerts** — High-severity alerts
   - **Pens Monitored** — Number of active pens
   - **Health Score** — 24-hour average health score
   - **Nursing Rate** — 24-hour average nursing rate

3. **Check the Farrowing Likelihood Banner**:
   - Displays a score from **0 to 100** indicating prediction confidence
   - Breakdown bars show 5 contributing factors:
     - Posture Switching
     - Movement Level
     - Lying Time
     - Feeding Reduction
     - Activity Level
   - A **48-hour trend sparkline** shows how the score has changed

4. **Review the Behavior Attention Banner**:
   - Highlights pens that need attention based on behavioral analytics
   - Click through to investigate specific pens

5. **Check Cleaning Suggestions**:
   - Lists pens that are **overdue** for cleaning or **due soon**
   - Click to navigate to the Tasks page for scheduling

6. **View Live Previews**:
   - Up to 4 camera feeds are shown in a grid
   - Click any preview to go to that pen's detailed monitor page

7. **Monitor the Risk Gauge**:
   - Displays the **maximum crushing risk** across all pens
   - Color-coded: Green (Low) → Yellow (Medium) → Orange (High) → Red (Critical)

8. **Review Recent Alerts**:
   - Shows the 3 most recent unresolved alerts
   - Click **Resolve** to mark an alert as handled

9. **Check the Test Pen Widget** (if Test Pen is active):
   - Shows real-time detection stats: sow count, piglet count, risk percentage, posture, behavior profiles

> **Auto-refresh**: The dashboard refreshes every 12 seconds. Real-time alert toasts appear via WebSocket when new alerts are generated.

---

## 4. Live Monitoring

The **Live Monitoring** page displays multiple camera feeds in a configurable grid with AI detection overlays.

### Step-by-Step Walkthrough

1. **Navigate** to **Live Monitoring** in the sidebar.

2. **Select a layout** using the grid selector buttons:
   - **1×1** — Single camera, full-width
   - **2×2** — Four cameras in a grid
   - **3×2** — Six cameras in a grid

3. **Configure detection settings** (gear icon):
   - **Confidence Threshold** — Slider (default: 0.25). Higher values show fewer, more confident detections. Lower values show more detections.
   - **Detection Mode** — Toggle between:
     - **Client-side** (ONNX in browser) — Lower latency, uses your device's CPU/GPU
     - **Server-side** — Uses the backend YOLO model
   - **Bounding Boxes** — Toggle to show/hide detection boxes on the video
   - **Frame Skip** — Skip frames to reduce CPU usage (2 / 5 / 10)

4. **Select a performance preset**:
   - **Quality** — Full resolution, minimal frame skipping
   - **Balanced** — Moderate frame skipping for smoother performance
   - **Performance** — Maximum frame skipping for low-powered devices

5. **View camera feeds**:
   - Each pen tile shows the live camera feed with colored bounding boxes around detected pigs
   - A **RiskGauge** widget on each tile shows the current crushing risk for that pen
   - Detection class labels appear on each bounding box (e.g., "sow-sleep", "piglet")

6. **Enter fullscreen view** for a single pen:
   - Click any pen tile to expand it to full width
   - The fullscreen view shows:
     - Large video feed with detection overlay
     - Stats sidebar: piglet count, sow posture, crushing risk gauge, detection processing time
   - Click **"Open Pen Details"** to go to the full Pen Monitor page

7. **Add a new pen**:
   - Click the **"Add Pen"** button
   - Fill in: Pen Name, Location, Camera Source (RTSP URL or MJPEG endpoint)
   - Save to add the pen to the monitoring grid

> **Performance tip**: The system uses IntersectionObserver to only process camera feeds that are currently visible on screen, saving CPU resources when scrolling.

---

## 5. Test Pen

The **Test Pen** allows you to upload a video or image file and run AI detection entirely in the browser — no camera required. This is ideal for testing the model, reviewing recorded footage, or demonstrating the system.

### Step-by-Step Walkthrough

1. **Navigate** to **Test Pen** in the sidebar.

2. **Upload media**:
   - **Drag and drop** a video (.mp4, .webm, .avi) or image (.jpg, .png) file onto the upload area
   - Or **click** the upload area to browse your files
   - The ONNX model (`pig_detection.onnx`) will load automatically on first use

3. **View the detection canvas**:
   - For **video**: A cropped center view is displayed with custom Play/Pause/Seek controls at the bottom
   - For **image**: The cropped center view appears with detections drawn immediately
   - Colored bounding boxes appear around detected pigs with class labels and confidence scores

4. **Explore the 5 tabs**:

   **a. Overview Tab**
   - Upload controls and status indicators
   - Real-time detection statistics (sow count, piglet count, confidence levels)
   - Quick summary of what the AI is detecting

   **b. Detections Tab**
   - Per-frame detection details
   - Bounding box coordinates, class labels, and confidence scores
   - Visual representation of each detection

   **c. Behavior Tab**
   - **Sow Behavior Profiles** — Each detected sow's posture history and behavioral patterns
   - **Posture Timeline** — Visual timeline showing posture transitions over time
   - **Nursing Session Tracking** — Detected nursing events with duration

   **d. Farrowing Tab**
   - Full farrowing record management for the test pen (Pen 10)
   - Create new farrowing records
   - Set breeding dates and expected farrowing dates
   - Add individual piglet records (birth weight, sex, status)

   **e. Live Monitor Tab**
   - Simulation engine status and metrics
   - Real-time event feed showing detection events as they occur
   - Charts: Piglet count over time, crushing risk history, health score trend, posture timeline

5. **Use video controls** (for video uploads):
   - **Play / Pause** button to control playback
   - **Seek bar** to jump to any point in the video
   - **Time display** showing current position and total duration

> **Important**: The Test Pen stays active even when you navigate to other pages, so detection continues in the background. The detection results feed into the Event Logs and Dashboard Test Pen Widget.

---

## 6. Tasks & Cleaning

The **Tasks** page helps you manage all farm operations, from routine cleaning to farrowing-related tasks.

### Step-by-Step Walkthrough

1. **Navigate** to **Tasks** in the sidebar.

2. **Review the summary cards** at the top:
   - Total tasks, Pending, In Progress, Completed, Overdue, Due Today

3. **Filter tasks**:
   - **Status filter**: All / My Tasks / Pending / In Progress / Completed
   - **Category icons**: Click to filter by category — Farrowing, Health, Feeding, Cleaning, Maintenance, Breeding, Weighing, Processing
   - **Search box**: Type to search tasks by title or description

4. **View the Cleaning Schedule**:
   - Each pen shows:
     - **Cleanliness score** — How clean the pen currently is
     - **Wetness score** — Moisture level
     - **Last cleaned** — When the pen was last cleaned
     - **Overdue indicator** — Red badge if cleaning is overdue
   - Click **"Mark Cleaned"** to record that a pen has been cleaned
   - Click **"Create Task"** to generate a cleaning task for a specific pen

5. **Create a new task**:
   - Click **"New Task"** button
   - Choose from a **template** for quick creation:
     - Pre-built templates for common tasks (feeding, health check, cleaning, etc.)
   - Or fill in manually:
     - **Title** — Task name
     - **Description** — Detailed instructions
     - **Category** — Farrowing / Health / Feeding / Cleaning / Maintenance / Breeding / Weighing / Processing
     - **Priority** — Low / Medium / High / Critical
     - **Pen** — Assign to a specific pen
     - **Sow** — Link to a specific sow (optional)
     - **Due Date** — When the task should be completed
     - **Checklist Items** — Add step-by-step sub-tasks

6. **Manage existing tasks**:
   - Click a task card to expand it and see details
   - **Start Task** — Move from Pending to In Progress
   - **Complete Task** — Mark as done
   - **Toggle checklist items** — Check off individual sub-tasks
   - **Delete Task** — Removes the task (with an 8-second undo window)

> **Tip**: When you start a farrowing event from the Farrowing page, related tasks are automatically created (e.g., "Prepare farrowing pen", "Monitor sow", "Record piglets").

---

## 7. Farrowing Management

The **Farrowing** page is the central hub for tracking the entire farrowing lifecycle — from predicting when a sow will farrow to recording piglet outcomes.

### Step-by-Step Walkthrough

1. **Navigate** to **Farrowing** in the sidebar.

2. **Review 30-Day Statistics** at the top:
   - Total farrowings completed
   - Average born alive per litter
   - Stillborn rate percentage
   - Total piglets born

3. **Check Due Sows** (left panel):
   - Lists sows that are expected to farrow soon
   - **Urgency indicators**:
     - 🔴 **Critical** — Due within 24 hours or overdue
     - 🟠 **High** — Due within 3 days
     - 🟢 **Normal** — Due later
   - Adjust the **lookahead period**: 3 / 7 / 14 / 30 days
   - Click **"Start"** next to a sow to begin recording a farrowing event
     - This automatically generates associated tasks (prepare pen, monitor sow, etc.)

4. **View Recent Farrowings** (right panel):
   - Shows in-progress and completed farrowing records
   - Each record displays:
     - Sow tag and name
     - Born alive / Total born / Stillborn counts
     - Sow condition badge (normal / weak / needs_attention)
   - Click a record to view full details

5. **Review the 7-Day Farrowing Timeline**:
   - A calendar grid showing which sows are expected to farrow on each day
   - Sow tags appear on their expected dates
   - Color-coded by urgency level

6. **Use Pre/Post Farrowing Comparison**:
   - Select a sow from the dropdown
   - View a side-by-side comparison of behavior **before** vs **after** farrowing:
     - **Summary cards**: Health Score, Nursing %, Crushing Risk, Piglet Count — each showing pre vs post values with the difference
     - **Activity Distribution**: Bar chart comparing nursing, feeding, and sleeping time
     - **Health & Risk Timeline**: Line chart with a vertical farrowing reference line
     - **Outcome Summary**: Born alive, total born, stillborn, duration, sow condition

### Recording a Farrowing Event

1. Click **"Start"** next to a due sow (or create a new record manually)
2. The record begins in **active** status
3. As piglets are born, add them to the record:
   - Piglet number (auto-incremented)
   - Sex (male / female)
   - Birth weight (kg)
   - Status (alive / stillborn)
   - Runt flag (automatically set if birth weight < 1.0 kg)
4. When farrowing is complete, click **"Complete Farrowing"**
5. Record the sow's condition (normal / weak / needs_attention)
6. Later, when piglets are weaned, click **"Wean"** to complete the lifecycle

---

## 8. Replay & Simulation

The **Replay** page lets you play back recorded behavior data through the analytics pipeline, allowing you to review historical events without needing the original video.

### Step-by-Step Walkthrough

1. **Navigate** to **Replay** in the sidebar.

2. **Select data to replay**:
   - **Pen** — Enter or select the pen number
   - **Hours** — Choose the time window: 6h, 12h, 24h, 48h, 72h, or 168h (7 days)
   - Click **"Load"** to fetch the behavior data

3. **Use the transport controls**:
   - **Play / Pause** — Start or stop automatic playback
   - **Step Forward / Step Back** — Move one frame at a time
   - **Fast Forward** — Increase playback speed: 1× / 2× / 4× / 8×
   - **Reset** — Return to the beginning
   - **Timeline Scrubber** — Drag the progress bar to jump to any point

4. **Read per-frame metrics**:
   - **Timestamp** — When this data was recorded
   - **Posture** — Sow's posture at this moment (color-coded)
   - **Piglet Count** — Number of piglets detected
   - **Crushing Risk** — Risk percentage at this moment
   - **Health Score** — Overall health score
   - **Nursing Status** — Whether the sow was nursing
   - **Movement Level** — Activity level

5. **Monitor the rolling chart**:
   - A line chart showing Health, Risk %, and Piglet Count over a ±25 frame window around the current playback position
   - Helps visualize trends around the current moment

> **Use case**: Review a period around a critical alert to understand what led to the event and how the sow behaved before and after.

---

## 9. Alerts

The **Alerts** page centralizes all system notifications so you can quickly identify and respond to critical events.

### Step-by-Step Walkthrough

1. **Navigate** to **Alerts** in the sidebar. The alert bell in the top bar also shows the unread count.

2. **Review alert statistics** at the top:
   - **Unread** — Alerts not yet viewed
   - **Critical** — Highest severity
   - **High** — Important but not immediate
   - **Medium / Low** — Informational alerts

3. **Filter alerts**:
   - **Severity**: All / Critical / High / Medium / Low
   - **Type**:
     - **Crushing Risk** — Sow may be overlaying piglets
     - **Posture Change** — Significant posture transition detected
     - **Piglet Count Change** — Unexpected change in visible piglet count
     - **System** — System-level notifications
   - **Show Resolved** — Toggle to include already-resolved alerts

4. **Manage individual alerts**:
   - Click **"Mark as Read"** to acknowledge an alert
   - Click **"Resolve"** to mark the alert as handled
   - Review the alert details: timestamp, pen, sow, severity, description

5. **Bulk actions**:
   - Click **"Mark All Read"** to acknowledge all unread alerts at once

### Alert Types Explained

| Alert Type | Trigger | Recommended Action |
|------------|---------|-------------------|
| **Crushing Risk** | Risk score exceeds threshold (configurable in Settings) | Check the pen immediately; consider separating piglets |
| **Posture Change** | Sow transitions to a high-risk posture (e.g., lying down quickly) | Monitor the pen; ensure piglets are not in danger |
| **Piglet Count Change** | Detected piglet count drops unexpectedly | Investigate — piglet may be trapped, crushed, or out of view |
| **System** | Camera disconnection, model loading error, etc. | Check system health and camera connections |

---

## 10. Event Logs

The **Event Logs** page provides a detailed history of all detection events, behavior logs, and system events.

### Step-by-Step Walkthrough

1. **Navigate** to **Event Logs** in the sidebar.

2. **Filter events**:
   - **Event Type** — Select from available types (loaded from the API)
   - **Category** — Filter by event category
   - **Show Count** — Display 25, 50, or 100 events per page

3. **Browse the event list**:
   - Each event shows: timestamp, type, category, description, associated pen/sow
   - Events are listed in reverse chronological order (newest first)

4. **Check Pen 10 indicator**:
   - When the Test Pen is actively running, an indicator shows that behavior logs are being generated
   - The Test Pen posts behavior logs and events every 12 seconds

> **Auto-refresh**: The event list refreshes every 12 seconds to show the latest events.

---

## 11. Sow Profiles

The **Sow Profiles** page is your master database for all sow records in the farm.

### Step-by-Step Walkthrough

1. **Navigate** to **Sow Profiles** in the sidebar.

2. **Search and filter**:
   - **Search bar** — Type a tag ID or sow name to filter
   - **Status filter** — All / Active / Pregnant / Lactating / Weaned / Inactive

3. **View the sow table**:
   - **Tag ID** — Unique identification number
   - **Name** — Sow's name
   - **Status** — Color-coded badge:
     - 🟢 Active — Available for breeding
     - 🟣 Pregnant — Currently gestating
     - 🔵 Lactating — Nursing piglets
     - 🟡 Weaned — Piglets recently separated
     - ⚫ Inactive — Retired or removed from herd
   - **Litter Size** — Current number of piglets
   - **Parity** — Number of times the sow has farrowed
   - **Pen** — Current pen assignment
   - **Created** — Date the record was added

4. **Add a new sow**:
   - Click **"Add Sow"** button
   - Fill in the form:
     - **Tag ID** (required) — Unique identifier (e.g., ear tag number)
     - **Name** — Optional friendly name
     - **Breed** — Sow breed
     - **Weight** (kg) — Current weight
     - **Parity** — Number of previous farrowings
     - **Status** — Current lifecycle status
     - **Current Litter Size** — Number of piglets (if applicable)
     - **Pen** — Assign to a pen
     - **Notes** — Any additional information
   - Click **Save**

5. **Edit a sow record**:
   - Click the **Edit** (pencil) icon on any row
   - Update the fields as needed
   - Click **Save**

6. **Delete a sow record**:
   - Click the **Delete** (trash) icon on any row
   - Confirm the deletion

### Sow Lifecycle

```
Active → Pregnant → Farrowing → Lactating → Weaned → Active (cycle repeats)
```

- **Active**: Sow is available for breeding
- **Pregnant**: After successful breeding; gestation is approximately 114 days
- **Farrowing**: Currently giving birth
- **Lactating**: Nursing piglets after farrowing
- **Weaned**: Piglets have been separated; sow returns to the active pool

---

## 12. Camera Setup

The **Camera Setup** page provides a 6-step wizard to configure IP cameras for pen monitoring.

### Step-by-Step Walkthrough

#### Step 1: Select Camera Brand

1. **Navigate** to **Camera Setup** in the sidebar.
2. Choose your camera brand from the list:
   - Hikvision, Dahua, Reolink, TP-Link/Tapo, Amcrest, Axis, Wyze, Ring, Generic ONVIF, Other/Custom
3. Each brand shows an icon and a brief description.
4. Click your brand to proceed.

#### Step 2: RTSP Availability

5. The system shows whether your selected brand supports **RTSP streaming** natively.
6. If RTSP is not directly supported, instructions for alternative connection methods may be shown.
7. Click **Next** to continue.

#### Step 3: Camera Account

8. Enter your camera's **Username** (e.g., `admin`).
9. Enter your camera's **Password**.
10. These credentials are used to authenticate with the camera's RTSP stream.
11. Click **Next** to continue.

#### Step 4: Network Setup

12. Enter the camera's **IP Address** (e.g., `192.168.1.100`).
13. Enter the **Port** (default varies by brand, typically 554 for RTSP).
14. Optionally toggle **Static IP** configuration:
    - Subnet Mask
    - Gateway
15. Click **Next** to continue.

#### Step 5: Connect to Pen

16. Select which **pen** this camera should be linked to.
17. If the pen doesn't exist yet, you can create one from this step.
18. Click **Next** to continue.

#### Step 6: Test & Save

19. The system auto-generates the **RTSP URL** based on your brand, credentials, and network settings.
    - Example: `rtsp://admin:password@192.168.1.100:554/stream1`
20. Click **"Copy URL"** to copy the RTSP address to your clipboard.
21. Click **"Test Connection"** to verify the camera is reachable:
    - ✅ **Connected** — Camera is working
    - ⏳ **Testing** — Connection in progress
    - ❌ **Failed** — Camera unreachable (check IP, port, credentials)
22. Once connected, click **"Save"** to store the configuration.

> **Supported brands** each have their own RTSP URL template that the wizard fills in automatically.

---

## 13. Pen Monitor (Individual Pen)

The **Pen Monitor** page provides a deep-dive view for a single pen with full analytics and management capabilities.

### Accessing the Pen Monitor

- Click a pen from the **Live Monitoring** page
- Click a pen from the **Dashboard** live previews
- Navigate directly to `/pen/{penId}`

### Step-by-Step Walkthrough

The page has **4 tabs**:

#### Overview Tab

1. **AI Welfare Insights** panel:
   - **Crushing Risk** — Current risk level with visual indicator
   - **Sow Posture** — Current posture and safety assessment
   - **Piglet Visibility** — Detected count vs expected count
   - **Lactation Status** — Nursing progress tracking
   - **Active Alerts** — Critical alerts for this specific pen

2. **Live Camera Feed**:
   - Full video stream with detection overlay
   - **RiskGauge** widget showing current crushing risk

3. **Behavior Analytics**:
   - Posture distribution chart
   - Activity patterns over time

4. **Farrowing Likelihood**:
   - Score (0–100) with breakdown factors
   - Trend visualization

#### Live Monitor Tab

5. **Simulation Engine Integration**:
   - Real-time event feed showing detection events as they happen
   - Posture timeline — Visual bar showing posture changes over time
   - Nursing session tracking with duration and frequency
   - Charts: Piglet count history, crushing risk history, health score trend
   - Sustained high-risk alerts when risk remains elevated

#### Farrowing Tab

6. **Create New Farrowing Record**:
   - Select sow, set breeding date (expected farrowing date auto-calculated at ~114 days)
   - Track active farrowing with real-time piglet recording

7. **View Past Records**:
   - Expandable/collapsible farrowing history
   - Individual piglet records (birth weight, sex, status, runt flag)
   - Complete/wean actions for active records

#### Health Tab

8. **Health Metrics**:
   - Overall health score with trend
   - Behavior analytics summary
   - Historical health data

---

## 14. Settings

The **Settings** page lets you customize the application to your preferences.

### Step-by-Step Walkthrough

1. **Navigate** to **Settings** in the sidebar.

2. **User Profile** (read-only):
   - Displays your username, email, full name, and role

3. **Notifications**:
   - Toggle **Push Notifications** on/off
   - Toggle **Sound Alerts** on/off

4. **Language**:
   - Choose between:
     - 🇺🇸 **English**
     - 🇵🇭 **Filipino (Tagalog)**
   - The entire UI will switch to the selected language

5. **Appearance**:
   - Toggle between **Light** and **Dark** theme

6. **Alert Thresholds**:
   - **Crushing Risk Threshold** — Slider from 30% to 90%
   - Alerts are generated when the crushing risk exceeds this threshold
   - Lower values = more sensitive (more alerts)
   - Higher values = less sensitive (fewer alerts, only high-risk)

7. **Data & Analytics**:
   - Link to view **Behavior Logs** for diagnostic purposes

8. Click **Save** to apply changes.

> Settings are persisted across sessions — you only need to configure them once.

---

## 15. AI Detection System

### How It Works

PRISMA ATLAS uses a **YOLOv8/YOLOv11** object detection model to identify pigs in camera feeds. The model runs in two modes:

| Mode | Location | Latency | Use Case |
|------|----------|---------|----------|
| **Client-side (ONNX)** | In your browser | Very low (~50–200ms) | Test Pen, Live Monitoring (default) |
| **Server-side (YOLO)** | On the backend server | Moderate (~100–500ms) | Higher accuracy, centralized processing |

### Detection Classes

The model detects 6 classes:

| Class | Description |
|-------|-------------|
| `piglet` | Individual piglet |
| `sow-sit` | Sow in sitting posture |
| `sow-sleep` | Sow lying down (lateral) |
| `sow-sleep-lactate` | Sow lying down and actively nursing piglets |
| `sow-stand` | Sow standing upright |
| `sow-stand-feed` | Sow standing at a feeder |

### Crushing Risk Assessment

The system calculates a crushing risk score from **0.0** (safe) to **1.0** (critical) based on:

1. **Sow posture base risk** — Lateral lying positions carry higher base risk (0.5)
2. **Proximity detection** — Piglets within the danger zone (50% of sow bounding box) increase risk, warning zone (80%) adds moderate risk
3. **Historical smoothing** — 30% weight given to the recent average to avoid flickering

| Risk Range | Level | Color | Recommended Action |
|------------|-------|-------|--------------------|
| 0.00 – 0.24 | Low | Green | Normal monitoring |
| 0.25 – 0.49 | Medium | Yellow | Increased attention |
| 0.50 – 0.74 | High | Orange | Alert caregiver |
| 0.75 – 1.00 | Critical | Red | Immediate response required |

### Farrowing Likelihood Score

A score from **0 to 100** predicting how likely a sow is to farrow soon, based on:

| Factor | What It Measures |
|--------|-----------------|
| Posture Switching | Frequency of posture changes (restlessness) |
| Movement Level | Overall activity and movement |
| Lying Time | Extended periods of lying down |
| Feeding Reduction | Decrease in feeding behavior |
| Activity Level | General activity patterns |

---

## 16. Common Workflows

### Workflow 1: Daily Monitoring Routine

1. **Log in** to PRISMA ATLAS
2. Check the **Dashboard** for overnight alerts and stats
3. Review any **Critical Alerts** and resolve them
4. Open **Live Monitoring** to scan all pens
5. Check **Tasks** for today's due items and cleaning schedule
6. Review **Farrowing** page for sows due to farrow today

### Workflow 2: Responding to a Crushing Risk Alert

1. You receive an alert notification (bell icon turns red, sound plays if enabled)
2. Click the **alert bell** or go to **Alerts** page
3. Identify the **pen** and **severity** of the alert
4. Click the pen to open the **Pen Monitor** page
5. Check the **live camera feed** and **crushing risk gauge**
6. If confirmed, take physical action (separate piglets, adjust sow position)
7. Return to the **Alerts** page and **Resolve** the alert

### Workflow 3: Recording a Farrowing Event

1. Go to **Farrowing** page
2. Find the sow in the **Due Sows** panel
3. Click **"Start"** to begin the farrowing record
4. As each piglet is born:
   - Go to the farrowing record
   - Click **"Add Piglet"**
   - Record sex, birth weight, and status
5. When all piglets are born, click **"Complete Farrowing"**
6. Record sow condition
7. Monitor the sow and piglets via the **Pen Monitor**
8. When piglets are old enough (typically 21–28 days), click **"Wean"**

### Workflow 4: Setting Up a New Camera

1. Go to **Camera Setup**
2. Follow the 6-step wizard (see [Section 12](#12-camera-setup))
3. After saving, go to **Live Monitoring**
4. Click **"Add Pen"** and assign the camera to a pen
5. Verify the feed appears in the monitoring grid

### Workflow 5: Testing the AI Model

1. Go to **Test Pen**
2. Upload a video or image of a pig pen
3. Watch the AI detect sows and piglets in real-time
4. Switch to the **Behavior** tab to see posture analysis
5. Check the **Live Monitor** tab for simulation metrics
6. Review results in the **Event Logs** page

### Workflow 6: Reviewing Historical Data

1. Go to **Replay** page
2. Select the pen number and time window
3. Click **"Load"** to fetch behavior data
4. Use transport controls to play through the data
5. Observe the metrics and rolling charts for patterns
6. Use **Pre/Post Farrowing Comparison** on the Farrowing page for deeper analysis

---

## 17. Troubleshooting

### Camera Not Connecting

| Issue | Solution |
|-------|----------|
| "Failed" status during camera test | Verify IP address, port, and credentials are correct |
| Black/blank video feed | Check that the camera is powered on and connected to the same network |
| RTSP stream drops frequently | Check network bandwidth; consider lowering resolution in camera settings |
| "Unsupported format" error | Ensure your camera outputs H.264 or H.265 encoded RTSP streams |

### Detection Issues

| Issue | Solution |
|-------|----------|
| No detections appearing | Check that the ONNX model has loaded (look for the model status indicator) |
| Too many false detections | Increase the confidence threshold in Live Monitoring settings |
| Detections are jittery | Increase the frame skip setting to reduce processing frequency |
| Bounding boxes misaligned | Refresh the page; ensure the browser window is not zoomed |

### Performance Issues

| Issue | Solution |
|-------|----------|
| Browser running slowly | Switch to **Performance** preset in Live Monitoring |
| High CPU usage | Reduce the number of visible camera feeds; increase frame skip |
| Page freezing | Close other browser tabs; use Chrome for best ONNX Runtime performance |

### Login Issues

| Issue | Solution |
|-------|----------|
| "Invalid credentials" error | Verify username and password; check with your administrator |
| Redirected to login repeatedly | Clear browser cookies and try again; check that the backend server is running |

---

## 18. Glossary

| Term | Definition |
|------|------------|
| **Farrowing** | The process of a sow giving birth to piglets |
| **Parity** | The number of times a sow has given birth |
| **Lactating** | A sow that is actively nursing her piglets |
| **Weaning** | The process of separating piglets from the sow; piglets begin eating solid food |
| **Crushing Risk** | The risk that a sow will lie on top of (overlay) her piglets, potentially injuring or killing them |
| **Dystocia** | A difficult or prolonged birth — flagged when no new piglet is born for over 45 minutes during active farrowing |
| **Cross-fostering** | Transferring piglets from one sow to another to balance litter sizes and improve survival rates |
| **Stillborn** | A piglet that is born dead |
| **Mummified** | A piglet that died during gestation and was partially reabsorbed in the uterus |
| **Runt** | An undersized piglet, typically with a birth weight under 1.0 kg |
| **Gestation** | The pregnancy period; approximately 114 days (3 months, 3 weeks, 3 days) from breeding to farrowing |
| **Posture** | The sow's body position — standing, sitting, sleeping (lateral), lactating (nursing), or feeding |
| **Breeding Date** | The date when the sow was mated; used to calculate the expected farrowing date |
| **Pen** | A physical enclosure in the barn where a sow and her piglets live |
| **ONNX** | Open Neural Network Exchange — a model format that allows AI inference to run directly in the web browser |
| **RTSP** | Real Time Streaming Protocol — the standard protocol used by IP cameras to transmit video |
| **NMS** | Non-Maximum Suppression — a post-processing technique that removes duplicate detection boxes |
| **Confidence Threshold** | The minimum confidence score (0–1) required for a detection to be displayed; lower = more detections |
| **Bounding Box** | A rectangle drawn around a detected object showing its location in the image |
| **WebSocket** | A real-time communication channel between the browser and server for instant updates |
| **JWT** | JSON Web Token — the authentication token used to keep you logged in |

---

*© 2025 PRISMA ATLAS — AI-Powered Pig Farrowing Monitoring System*
