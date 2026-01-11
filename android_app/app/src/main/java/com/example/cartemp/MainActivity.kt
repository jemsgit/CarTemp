package com.example.cartemp

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.Intent
import android.content.pm.PackageManager
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.*
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.*

class MainActivity : AppCompatActivity() {

    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private lateinit var btService: BluetoothService
    private var monitoringJob: Job? = null

    private lateinit var deviceList: ListView
    private lateinit var tempDisplay: TextView
    private lateinit var connectBtn: Button
    private lateinit var disconnectBtn: Button
    private lateinit var refreshBtn: Button

    private val handler = Handler(Looper.getMainLooper())

    companion object {
        private const val REQUEST_ENABLE_BT = 1
        private const val REQUEST_BLUETOOTH_PERMISSIONS = 2
        private const val TAG = "CarTemp"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        btService = BluetoothService(this)

        initViews()
        setupClickListeners()

        // Check for Bluetooth permissions
        checkPermissions()
    }

    private fun initViews() {
        deviceList = findViewById(R.id.device_list)
        tempDisplay = findViewById(R.id.temperature_display)
        connectBtn = findViewById(R.id.connect_btn)
        disconnectBtn = findViewById(R.id.disconnect_btn)
        refreshBtn = findViewById(R.id.refresh_btn)

        // Initially disable buttons that require connection
        disconnectBtn.isEnabled = false
    }

    private fun setupClickListeners() {
        connectBtn.setOnClickListener {
            // This will be handled after device selection
        }

        disconnectBtn.setOnClickListener {
            runBlocking {
                btService.disconnect()
                disconnectBtn.isEnabled = false
                connectBtn.isEnabled = true
                tempDisplay.text = "Disconnected"
                stopMonitoring()
            }
        }

        refreshBtn.setOnClickListener {
            loadPairedDevices()
        }
    }

    private fun loadPairedDevices() {
        GlobalScope.launch(Dispatchers.Main) {
            try {
                val devices = btService.getPairedDevices()
                val deviceNames = devices.map { it.name ?: it.address }

                val adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_list_item_1, deviceNames)
                deviceList.adapter = adapter

                deviceList.onItemClickListener = { _, _, position, _ ->
                    val selectedDevice = devices[position]
                    connectToDevice(selectedDevice.address)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error loading paired devices", e)
                Toast.makeText(this@MainActivity, "Error loading devices", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun connectToDevice(deviceAddress: String) {
        GlobalScope.launch {
            try {
                val connected = btService.connectToDevice(deviceAddress)

                withContext(Dispatchers.Main) {
                    if (connected) {
                        Toast.makeText(this@MainActivity, "Connected to device", Toast.LENGTH_SHORT).show()
                        connectBtn.isEnabled = false
                        disconnectBtn.isEnabled = true
                        startMonitoring()
                    } else {
                        Toast.makeText(this@MainActivity, "Failed to connect", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Connection error", e)
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MainActivity, "Connection error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun startMonitoring() {
        stopMonitoring() // Stop any existing monitoring

        monitoringJob = GlobalScope.launch {
            while (isActive) {
                if (btService.isConnected()) {
                    val temp = btService.getTemperature()
                    withContext(Dispatchers.Main) {
                        if (temp != null) {
                            tempDisplay.text = "${temp}°C"
                            updateTemperatureColor(temp)
                        } else {
                            tempDisplay.text = "No data"
                        }
                    }
                }
                delay(2000) // Update every 2 seconds
            }
        }
    }

    private fun stopMonitoring() {
        monitoringJob?.cancel()
        monitoringJob = null
    }

    private fun updateTemperatureColor(temp: Int) {
        // Calculate color based on temperature
        val normalizedTemp = when {
            temp < 0 -> 0f
            temp > 100 -> 100f
            else -> temp.toFloat()
        }

        val hue = (1 - (normalizedTemp / 100)) * 200
        val color = android.graphics.Color.HSVToColor(floatArrayOf(hue, 1.0f, 1.0f))

        tempDisplay.setBackgroundColor(color)
    }

    private fun checkPermissions() {
        val permissionsToRequest = mutableListOf<String>()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.BLUETOOTH)
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_ADMIN) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.BLUETOOTH_ADMIN)
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.BLUETOOTH_CONNECT)
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
            permissionsToRequest.add(Manifest.permission.BLUETOOTH_SCAN)
        }

        if (permissionsToRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toTypedArray(),
                REQUEST_BLUETOOTH_PERMISSIONS
            )
        } else {
            // Permissions already granted, proceed with loading devices
            loadPairedDevices()
        }
    }

    private fun setupBluetooth() {
        // Enable Bluetooth if not enabled
        if (bluetoothAdapter?.isEnabled == false) {
            val enableBtIntent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
            startActivityForResult(enableBtIntent, REQUEST_ENABLE_BT)
        } else {
            loadPairedDevices()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == REQUEST_BLUETOOTH_PERMISSIONS) {
            var allGranted = true
            for (result in grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false
                    break
                }
            }

            if (allGranted) {
                setupBluetooth()
            } else {
                Log.e(TAG, "Bluetooth permissions not granted")
                Toast.makeText(this, "Bluetooth permissions are required", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == REQUEST_ENABLE_BT) {
            if (resultCode == RESULT_OK) {
                // Bluetooth was enabled, load devices
                loadPairedDevices()
            } else {
                Log.e(TAG, "Bluetooth was not enabled")
                Toast.makeText(this, "Bluetooth needs to be enabled", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopMonitoring()
        runBlocking {
            btService.disconnect()
        }
    }
}