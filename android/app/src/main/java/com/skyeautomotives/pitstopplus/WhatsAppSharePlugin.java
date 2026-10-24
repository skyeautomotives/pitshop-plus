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

    // Opens the customer's own chat with the message typed in. This works for numbers
    // that are not saved in contacts, unlike sending a file, which then asks to pick a chat.
    @PluginMethod
    public void openChat(PluginCall call) {
        String phone = call.getString("phone");
        String text = call.getString("text", "");
        if (phone == null || !phone.matches("[0-9]{10,15}")) {
            call.reject("Missing phone number.");
            return;
        }
        Uri link = Uri.parse("https://api.whatsapp.com/send?phone=" + phone + "&text=" + Uri.encode(text));
        for (String app : APPS) {
            Intent intent = new Intent(Intent.ACTION_VIEW, link);
            intent.setPackage(app);
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

    @PluginMethod
    public void sendFile(PluginCall call) {
        String path = call.getString("path");
        String phone = call.getString("phone");
        String text = call.getString("text", "");
        String only = call.getString("app");
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
            // Use the same WhatsApp that opened the chat.
            if (only != null && !only.equals(app)) continue;
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("application/pdf");
            intent.setPackage(app);
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            if (!text.isEmpty()) intent.putExtra(Intent.EXTRA_TEXT, text);
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
