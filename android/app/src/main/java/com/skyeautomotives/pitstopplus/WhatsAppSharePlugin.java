package com.skyeautomotives.pitstopplus;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/** Opens WhatsApp straight in one customer's chat with a file attached. */
@CapacitorPlugin(name = "WhatsAppShare")
public class WhatsAppSharePlugin extends Plugin {

    // Workshops often use WhatsApp Business, so try it first.
    private static final String[] APPS = { "com.whatsapp.w4b", "com.whatsapp" };

    @PluginMethod
    public void sendFile(PluginCall call) {
        String path = call.getString("path");
        String phone = call.getString("phone");
        String text = call.getString("text", "");
        if (path == null || phone == null || !phone.matches("[0-9]{10,15}")) {
            call.reject("Missing file or phone number.");
            return;
        }

        File file = new File(Uri.parse(path).getPath());
        if (!file.exists()) {
            call.reject("File not found.");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);

        for (String app : APPS) {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/pdf");
            intent.setPackage(app);
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.putExtra(Intent.EXTRA_TEXT, text);
            intent.putExtra("jid", phone + "@s.whatsapp.net");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
                JSObject result = new JSObject();
                result.put("app", app);
                call.resolve(result);
                return;
            } catch (ActivityNotFoundException e) {
                // Not installed: try the next one.
            }
        }
        call.reject("WhatsApp is not installed.", "NOT_INSTALLED");
    }
}
