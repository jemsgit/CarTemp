package com.example.cartemp

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.*

class BluetoothService(private val context: Context) {
    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var bluetoothSocket: BluetoothSocket? = null
    private var inputStream: InputStream? = null
    private var outputStream: OutputStream? = null
    private var isConnected = false
    private var connectionJob: Job? = null
    
    companion object {
        private const val TAG = "BluetoothService"
        private const val ELM327_UUID = "00001101-0000-1000-8000-00805F9B34FB"
    }
    
    suspend fun getPairedDevices(): List<BluetoothDevice> {
        return withContext(Dispatchers.IO) {
            val pairedDevices = bluetoothAdapter?.bondedDevices ?: emptySet()
            pairedDevices.toList()
        }
    }
    
    suspend fun connectToDevice(deviceAddress: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val device: BluetoothDevice = bluetoothAdapter?.getRemoteDevice(deviceAddress) ?: return@withContext false
                
                // Close any existing connection
                closeConnection()
                
                // Create a socket
                bluetoothSocket = device.createRfcommSocketToServiceRecord(UUID.fromString(ELM327_UUID))
                
                // Connect to the device
                bluetoothSocket?.connect()
                
                // Get input and output streams
                inputStream = bluetoothSocket?.inputStream
                outputStream = bluetoothSocket?.outputStream
                
                isConnected = true
                
                Log.d(TAG, "Connected to device: ${device.name}")
                
                // Initialize ELM327
                initElm327()
                
                true
            } catch (e: IOException) {
                Log.e(TAG, "Error connecting to device", e)
                closeConnection()
                false
            }
        }
    }
    
    private suspend fun initElm327() {
        withContext(Dispatchers.IO) {
            try {
                // Send reset command
                sendData("ATZ\r\n")
                delay(1000)
                
                // Wait for response and clear it
                readResponse()
                
                // Set protocol to automatic
                sendData("ATSP0\r\n")
                delay(500)
                readResponse()
                
                // Test connection with 0100 command
                sendData("0100\r\n")
                delay(500)
                
                var response = readResponse()
                var attempts = 0
                val maxAttempts = 10
                
                while (!isValidResponse(response) && attempts < maxAttempts) {
                    response = readResponse()
                    attempts++
                    delay(500)
                }
                
                Log.d(TAG, "ELM327 initialized")
            } catch (e: Exception) {
                Log.e(TAG, "Error initializing ELM327", e)
            }
        }
    }
    
    private fun isValidResponse(response: String?): Boolean {
        return !response.isNullOrEmpty() && response.contains(Regex("[0-9A-Z]{2}\\s[0-9A-Z]{2}\\s[0-9A-Z]{2}"))
    }
    
    suspend fun getTemperature(): Int? {
        return withContext(Dispatchers.IO) {
            try {
                sendData("0105\r\n")
                delay(500)
                
                val response = readResponse()
                
                if (!response.isNullOrEmpty()) {
                    // Parse temperature from response
                    // Response format: "41 05 5F" -> temperature in hex
                    val parts = response.trim().split("\\s+".toRegex())
                    if (parts.size >= 3) {
                        val tempHex = parts[2] // Third part contains temperature
                        val tempValue = Integer.parseInt(tempHex, 16)
                        return@withContext tempValue - 40 // Convert to Celsius
                    }
                }
                
                null
            } catch (e: Exception) {
                Log.e(TAG, "Error getting temperature", e)
                null
            }
        }
    }
    
    private suspend fun sendData(command: String) {
        withContext(Dispatchers.IO) {
            try {
                outputStream?.write(command.toByteArray(Charsets.UTF_8))
                Log.d(TAG, "Sent: $command")
            } catch (e: IOException) {
                Log.e(TAG, "Error sending data", e)
            }
        }
    }
    
    private suspend fun readResponse(): String? {
        return withContext(Dispatchers.IO) {
            try {
                val buffer = ByteArray(1024)
                var bytesRead = 0
                val startTime = System.currentTimeMillis()
                val timeout = 5000L // 5 seconds timeout
                
                // Read until we get a response or timeout
                while (bytesRead == 0 && System.currentTimeMillis() - startTime < timeout) {
                    if (inputStream?.available() ?: 0 > 0) {
                        bytesRead = inputStream?.read(buffer) ?: 0
                    }
                    delay(100)
                }
                
                if (bytesRead > 0) {
                    val response = String(buffer, 0, bytesRead, Charsets.UTF_8)
                    Log.d(TAG, "Received: $response")
                    response
                } else {
                    Log.d(TAG, "No response received within timeout")
                    null
                }
            } catch (e: IOException) {
                Log.e(TAG, "Error reading response", e)
                null
            }
        }
    }
    
    suspend fun disconnect() {
        withContext(Dispatchers.IO) {
            closeConnection()
        }
    }
    
    private fun closeConnection() {
        try {
            inputStream?.close()
            outputStream?.close()
            bluetoothSocket?.close()
            isConnected = false
            Log.d(TAG, "Bluetooth connection closed")
        } catch (e: IOException) {
            Log.e(TAG, "Error closing connection", e)
        }
    }
    
    fun isConnected(): Boolean {
        return isConnected && bluetoothSocket?.isConnected == true
    }
}