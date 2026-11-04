package com.samimrrza.spendflow.credentialmanager;

import android.app.Activity;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.credentials.CreateCredentialRequest;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CreatePasswordRequest;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.exceptions.CreateCredentialException;
import androidx.credentials.exceptions.CreateCredentialInterruptedException;
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException;
import androidx.credentials.exceptions.CreateCredentialUnknownException;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

/**
 * Saves the user's master password to the system password manager via
 * Android 14+ Credential Manager. On Android 13 and below it resolves false
 * (the password stays in expo-secure-store only).
 */
@ReactModule(name = CredentialManagerModule.NAME)
public class CredentialManagerModule extends ReactContextBaseJavaModule {
  public static final String NAME = "CredentialManagerModule";
  private static final String TAG = "CredentialManagerModule";

  private final ReactApplicationContext reactContext;
  private CredentialManager credentialManager;
  private Promise pendingPromise;

  public CredentialManagerModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // Android 14+ (API 34+)
      this.credentialManager = CredentialManager.create(reactContext);
    }
  }

  @Override
  @NonNull
  public String getName() {
    return NAME;
  }

  @ReactMethod
  public void savePassword(String email, String password, Promise promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // Android 13 and below - use Autofill framework (deprecated but still works)
      savePasswordLegacy(email, password, promise);
      return;
    }

    if (credentialManager == null) {
      promise.reject("CREDENTIAL_MANAGER_UNAVAILABLE", "Credential Manager not available on this device");
      return;
    }

    this.pendingPromise = promise;

    CreatePasswordRequest request = new CreatePasswordRequest(
        email, // user ID (email)
        password // password
    );

    // Get current activity
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No current activity to show credential UI");
      return;
    }

    credentialManager.createCredentialAsync(
        activity,
        request,
        null, // no cancellation signal
        ContextCompat.getMainExecutor(activity),
        new CredentialManagerCallback<CreateCredentialResponse, CreateCredentialException>() {
          @Override
          public void onResult(@NonNull CreateCredentialResponse result) {
            if (pendingPromise != null) {
              pendingPromise.resolve(true);
              pendingPromise = null;
            }
          }

          @Override
          public void onError(@NonNull CreateCredentialException e) {
            if (pendingPromise != null) {
              String errorMessage = e.getMessage();
              String errorCode = "CREATE_CREDENTIAL_FAILED";

              if (e instanceof CreateCredentialInterruptedException) {
                errorCode = "USER_CANCELLED";
                errorMessage = "User cancelled the save password prompt";
              } else if (e instanceof CreateCredentialProviderConfigurationException) {
                errorCode = "PROVIDER_CONFIG_ERROR";
                errorMessage = "Password manager not configured";
              } else if (e instanceof CreateCredentialUnknownException) {
                errorCode = "UNKNOWN_ERROR";
              }

              pendingPromise.reject(errorCode, errorMessage);
              pendingPromise = null;
            }
          }
        }
    );
  }

  @SuppressWarnings("deprecation")
  private void savePasswordLegacy(String email, String password, Promise promise) {
    // For Android 13 and below, we can't easily trigger the "Save password?" dialog
    // without implementing an AutofillService. The modern approach is Credential Manager.
    // We'll silently resolve - the password stays in expo-secure-store.
    Log.w(TAG, "savePassword: Credential Manager requires Android 14+ (API 34). Current: " + Build.VERSION.SDK_INT);
    promise.resolve(false); // false = not saved to system password manager
  }
}
