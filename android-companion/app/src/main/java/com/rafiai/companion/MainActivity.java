package com.rafiai.companion;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends android.app.Activity {
    static final String PREFS = "rafi_companion";
    static final String SERVER = "server";
    static final String TOKEN = "token";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);

        // contacts permission so Rafi can message people by saved name
        if (checkSelfPermission(android.Manifest.permission.READ_CONTACTS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.READ_CONTACTS}, 1);
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 32, 32, 32);

        TextView title = new TextView(this);
        title.setText("Rafi AI Companion 1.2");
        title.setTextSize(26);
        root.addView(title);

        TextView info = new TextView(this);
        info.setText("Enter the Rafi AI server URL and device token, save them, allow Contacts, then enable Rafi AI Companion in Android Accessibility settings.");
        root.addView(info);

        EditText server = new EditText(this);
        server.setHint("https://your-rafi-domain.vercel.app");
        server.setText(p.getString(SERVER, ""));
        root.addView(server);

        EditText token = new EditText(this);
        token.setHint("DEVICE_TOKEN");
        token.setSingleLine(true);
        token.setText(p.getString(TOKEN, ""));
        root.addView(token);

        Button save = new Button(this);
        save.setText("Save connection");
        save.setOnClickListener(v -> p.edit()
                .putString(SERVER, server.getText().toString().trim().replaceAll("/+$", ""))
                .putString(TOKEN, token.getText().toString().trim())
                .apply());
        root.addView(save);

        Button settings = new Button(this);
        settings.setText("Open Accessibility settings");
        settings.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        root.addView(settings);

        Button test = new Button(this);
        test.setText("Open Rafi AI website");
        test.setOnClickListener(v -> {
            String url = server.getText().toString().trim();
            if (!url.isEmpty()) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        });
        root.addView(test);

        setContentView(root);
    }
}
