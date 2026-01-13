/*
       Licensed to the Apache Software Foundation (ASF) under one
       or more contributor license agreements.  See the NOTICE file
       distributed with this work for additional information
       regarding copyright ownership.  The ASF licenses this file
       to you under the Apache License, Version 2.0 (the
       "License"); you may not use this file except in compliance
       with the License.  You may obtain a copy of the License at

         http://www.apache.org/licenses/LICENSE-2.0

       Unless required by applicable law or agreed to in writing,
       software distributed under the License is distributed on an
       "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
       KIND, either express or implied.  See the License for the
       specific language governing permissions and limitations
       under the License.
*/
package cordova.plugins;

/*
 * Imports
 */

import android.content.pm.PackageManager;
import android.hardware.Camera;
import android.util.Log;
import android.os.Build;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaWebView;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Objects;

/**
 * Diagnostic plugin implementation for Android
 */
public class Diagnostic_Camera extends CordovaPlugin{


    /*************
     * Constants *
     *************/


    /**
     * Tag for debug log messages
     */
    public static final String TAG = "Diagnostic_Camera";

    protected static final String cameraPermission = "CAMERA";
    protected static String[] storagePermissions;
    static {
        if (android.os.Build.VERSION.SDK_INT >= 34) { // Build.VERSION_CODES.UPSIDE_DOWN_CAKE / Android 14
            storagePermissions = new String[]{ "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO", "READ_MEDIA_VISUAL_USER_SELECTED" };
        } else if (android.os.Build.VERSION.SDK_INT >= 33) { // Build.VERSION_CODES.TIRAMISU / Android 13
            storagePermissions = new String[]{ "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO" };
        } else {
            storagePermissions = new String[]{ "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE" };
        }
    }


    /*************
     * Variables *
     *************/

    /**
     * Singleton class instance
     */
    public static Diagnostic_Camera instance = null;

    private Diagnostic diagnostic;

    /**
     * Current Cordova callback context (on this thread)
     */
    protected CallbackContext currentContext;


    /*************
     * Public API
     ************/

    /**
     * Constructor.
     */
    public Diagnostic_Camera() {}

    /**
     * Sets the context of the Command. This can then be used to do things like
     * get file paths associated with the Activity.
     *
     * @param cordova The context of the main Activity.
     * @param webView The CordovaWebView Cordova is running in.
     */
    public void initialize(CordovaInterface cordova, CordovaWebView webView) {
        Log.d(TAG, "initialize()");
        instance = this;
        diagnostic = Diagnostic.getInstance();

        super.initialize(cordova, webView);
    }


    /**
     * Executes the request and returns PluginResult.
     *
     * @param action            The action to execute.
     * @param args              JSONArry of arguments for the plugin.
     * @param callbackContext   The callback id used when calling back into JavaScript.
     * @return                  True if the action was valid, false if not.
     */
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException {
        Diagnostic.instance.currentContext = currentContext = callbackContext;

        try {
            if(action.equals("isCameraPresent")) {
                callbackContext.success(isCameraPresent() ? 1 : 0);
            } else if(action.equals("requestCameraAuthorization")) {
                requestCameraAuthorization(args, callbackContext);
            } else if(action.equals("getCameraAuthorizationStatus")) {
                getCameraAuthorizationStatus(args, callbackContext);
            } else if(action.equals("getCameraAuthorizationStatuses")) {
                getCameraAuthorizationStatuses(args, callbackContext);
            }else {
                diagnostic.handleError("Invalid action");
                return false;
            }
        }catch(Exception e ) {
            diagnostic.handleError("Exception occurred: ".concat(Objects.requireNonNull(e.getMessage())));
            return false;
        }
        return true;
    }

    public boolean isCameraPresent() {
        int numberOfCameras = Camera.getNumberOfCameras();
        PackageManager pm = this.cordova.getActivity().getPackageManager();
        final boolean deviceHasCameraFlag = android.os.Build.VERSION.SDK_INT >= 32 ? pm.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) : pm.hasSystemFeature(PackageManager.FEATURE_CAMERA);
        boolean result = (deviceHasCameraFlag && numberOfCameras>0 );
        return result;
    }


    /************
     * Internals
     ***********/

    private String[] getPermissions(boolean storage){
        String[] permissions = {cameraPermission};
        if(storage){
            permissions = Diagnostic.instance.concatStrings(permissions, storagePermissions);
        }
        return permissions;
    }

    private void requestCameraAuthorization(JSONArray args, CallbackContext callbackContext) throws Exception{
        boolean storage = args.getBoolean(0);
        String[] permissions = getPermissions(storage);
        int requestId = Diagnostic.instance.storeContextByRequestId(callbackContext);
        Diagnostic.instance._requestRuntimePermissions(Diagnostic.instance.stringArrayToJsonArray(permissions), requestId);
    }

    private void getCameraAuthorizationStatuses(JSONArray args, CallbackContext callbackContext) throws Exception{
        boolean storage = args.getBoolean(0);
        String[] permissions = getPermissions(storage);
        JSONObject statuses = Diagnostic.instance._getPermissionsAuthorizationStatus(permissions);
        callbackContext.success(statuses);
    }

    private void getCameraAuthorizationStatus(JSONArray args, CallbackContext callbackContext) throws Exception{
        boolean storage = args.getBoolean(0);
        String[] permissions = getPermissions(storage);
        JSONObject statuses = Diagnostic.instance._getPermissionsAuthorizationStatus(permissions);

        String cameraStatus = getStatusForPermission(statuses, cameraPermission);

        String storageStatus = "DENIED";
        if(storage) {
            if (
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                            (
                                    getStatusForPermission(statuses, "READ_MEDIA_IMAGES").equals("GRANTED") ||
                                            getStatusForPermission(statuses, "READ_MEDIA_VIDEO").equals("GRANTED")
                            )
            ) {
                // Full access on Android 13 (API level 33) or higher
                storageStatus = "GRANTED";
            } else if (
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
                            getStatusForPermission(statuses, "READ_MEDIA_VISUAL_USER_SELECTED").equals("GRANTED")
            ) {
                // Partial access on Android 14 (API level 34) or higher
                storageStatus = "LIMITED";
            } else if (
                    getStatusForPermission(statuses, "READ_EXTERNAL_STORAGE").equals("GRANTED")
            ) {
                // Full access up to Android 12 (API level 32)
                storageStatus = "GRANTED";
            } else {
                // Combination of statuses for all storage permissions for relevant API level
                storageStatus = combinePermissionStatuses(statuses);
            }
        }
        String status = cameraStatus;
        if(storage){
            status = combinePermissionStatuses(new String[]{cameraStatus, storageStatus});
        }

        callbackContext.success(status);
    }

    private String getStatusForPermission(JSONObject statuses, String permissionName) throws JSONException {
        return statuses.has(permissionName) ? statuses.getString(permissionName) : "DENIED";
    }

    private boolean anyStatusIs(String status, String[] statuses){
        for(String s : statuses){
            if(s.equals(status)){
                return true;
            }
        }
        return false;
    }

    private String combinePermissionStatuses(JSONObject permissionsStatuses) throws JSONException {
        String[] statuses = new String[storagePermissions.length];
        for(int i = 0; i < storagePermissions.length; i++){
            statuses[i] = getStatusForPermission(permissionsStatuses, storagePermissions[i]);
        }
        return combinePermissionStatuses(statuses);
    }

    private String combinePermissionStatuses(String[] statuses){
        if(anyStatusIs("DENIED_ALWAYS", statuses)){
            return "DENIED_ALWAYS";
        }else if(anyStatusIs("LIMITED", statuses)){
            return "LIMITED";
        }else if(anyStatusIs("DENIED", statuses)){
            return "DENIED";
        }else if(anyStatusIs("GRANTED", statuses)){
            return "GRANTED";
        }else{
            return "NOT_REQUESTED";
        }
    }
}
