# Car Engine Temperature Monitor - Native Android App

This is a native Android application that connects to an OBD2 device via Bluetooth to monitor car engine temperature.

## Features

- Discover and connect to paired Bluetooth OBD2 devices
- Real-time engine temperature monitoring
- Visual temperature display with color-coded background
- Connection management (connect/disconnect)

## Prerequisites

- Android Studio Flamingo | 2022.2.1 or later
- Android SDK with API level 21 or higher
- A physical Android device with Bluetooth capabilities (OBD2 devices typically don't work with emulators)

## Building the Project

1. Open Android Studio
2. Select "Open an existing project"
3. Navigate to and select the `android_app` folder
4. Android Studio will automatically sync the Gradle files
5. Connect your Android device via USB with developer options enabled
6. Click the "Run" button (green triangle) or press Shift+F10

## Permissions

The app requires the following permissions:
- BLUETOOTH
- BLUETOOTH_ADMIN
- ACCESS_FINE_LOCATION
- BLUETOOTH_CONNECT
- BLUETOOTH_SCAN

These are declared in the AndroidManifest.xml file and will be requested at runtime.

## Usage

1. Pair your OBD2 device with your Android device via Bluetooth settings
2. Launch the app
3. Tap "Refresh Devices" to see paired devices
4. Select your OBD2 device from the list to connect
5. The app will initialize the ELM327 chip and start displaying temperature data
6. Temperature updates every 2 seconds with a color-coded background
7. Use the Disconnect button to end the session

## Technical Details

- Uses RFCOMM sockets for Bluetooth communication
- Implements ELM327 AT command protocol
- Parses OBD2 PID 0105 for engine coolant temperature
- Temperature is displayed in Celsius (calculated as hex value - 40)