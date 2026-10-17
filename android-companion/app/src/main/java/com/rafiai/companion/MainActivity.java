package com.rafiai.companion;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends android.app.Activity {
    static final String PREFS = "rafi_companion";
    static final String SERVER = "server";
    static final String TOKEN = "token";
    static final String DEFAULT_SERVER = "https://rafi-ai-website.vercel.app";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView status;
    private String testResult = "";
    private SharedPreferences p;

    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            try { status.setText(buildStatus()); } catch (Throwable ignored) {}
            ui.postDelayed(this, 1500);
        }
    };

    private boolean serviceEnabled() {
        try {
            String s = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
            return s != null && s.contains(getPackageName());
        } catch (Exception e) { return false; }
    }

    private void startKeepAlive() {
        try {
            startForegroundService(new Intent(this, KeepAliveService.class));
        } catch (Throwable t) {
            p.edit().putString("fg_err", "start: " + t.getClass().getSimpleName() + ": " + t.getMessage()).apply();
        }
    }

    private String buildStatus() {
        SimpleDateFormat f = new SimpleDateFormat("HH:mm:ss", Locale.US);
        long now = System.currentTimeMillis();
        StringBuilder b = new StringBuilder();
        boolean on = serviceEnabled();
        long hb = p.getLong("hb", 0);
        long hbAge = hb == 0 ? -1 : (now - hb) / 1000;
        boolean alive = hb != 0 && hbAge <= 12;
        b.append("Accessibility switch: ").append(on ? "ON" : "OFF  <-- turn it on").append('\n');
        if (on && alive) b.append("SERVICE: RUNNING\n");
        else if (on) b.append("SERVICE: NOT RUNNING (switch says ON but the phone stopped it). Open Accessibility settings, switch Rafi AI Companion OFF, then ON.\n");
        long fgOk = p.getLong("fg_ok", 0);
        String fgErr = p.getString("fg_err", "");
        if (!fgErr.isEmpty()) b.append("Keep-alive notification: FAILED (").append(fgErr).append(")\n");
        else if (fgOk != 0) b.append("Keep-alive notification: ON (since ").append(f.format(new Date(fgOk))).append(")\n");
        else b.append("Keep-alive notification: starting...\n");
        long started = p.getLong("svc_started", 0);
        b.append("Service started: ").append(started == 0 ? "never (switch Accessibility off and on)" : f.format(new Date(started))).append('\n');
        b.append("Heartbeat: ").append(hb == 0 ? "none" : hbAge + "s ago").append('\n');
        long at = p.getLong("last_poll_at", 0);
        long ago = at == 0 ? -1 : (now - at) / 1000;
        b.append("Last poll: ").append(at == 0 ? "none yet" : f.format(new Date(at)) + " (" + ago + "s ago)").append('\n');
        b.append("Poll result: ").append(p.getString("last_poll_res", "-")).append('\n');
        b.append("Stuck polls restarted: ").append(p.getInt("restarts", 0)).append('\n');
        long unb = p.getLong("svc_unbound", 0);
        if (unb != 0) b.append("Phone unbound the service at: ").append(f.format(new Date(unb))).append('\n');
        long des = p.getLong("svc_destroyed", 0);
        if (des != 0) b.append("Phone destroyed the service at: ").append(f.format(new Date(des))).append('\n');
        long crashAt = p.getLong("crash_at", 0);
        if (crashAt != 0) b.append("App crash at ").append(f.format(new Date(crashAt))).append(": ").append(p.getString("crash", "?")).append('\n');
        String lerr = p.getString("last_err", "");
        if (!lerr.isEmpty()) b.append("Last internal error: ").append(lerr).append('\n');
        long cat = p.getLong("last_cmd_at", 0);
        b.append("Last command: ");
        if (cat == 0) b.append("none received yet");
        else b.append(p.getString("last_cmd", "-")).append(" at ").append(f.format(new Date(cat)));
        b.append('\n');
        b.append("Command result: ").append(p.getString("last_cmd_res", "-")).append('\n');
        if (!testResult.isEmpty()) b.append("Test: ").append(testResult).append('\n');
        return b.toString();
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        p = getSharedPreferences(PREFS, MODE_PRIVATE);

        // contacts permission so Rafi can message people by saved name, notification permission for the keep-alive notice
        java.util.ArrayList<String> need = new java.util.ArrayList<>();
        if (checkSelfPermission(android.Manifest.permission.READ_CONTACTS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            need.add(android.Manifest.permission.READ_CONTACTS);
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            need.add(android.Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), 1);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 32, 32, 32);

        TextView title = new TextView(this);
        title.setText("Rafi AI Companion 1.8");
        title.setTextSize(26);
        root.addView(title);

        TextView info = new TextView(this);
        info.setText("1) Enter the device token and press Save. 2) Press Test connection (must say OK). 3) Press 'Keep running in background' and choose Don't optimize. 4) Open Accessibility settings and switch Rafi AI Companion on. The Status below must say SERVICE: RUNNING.");
        root.addView(info);

        EditText server = new EditText(this);
        server.setHint(DEFAULT_SERVER);
        server.setText(p.getString(SERVER, DEFAULT_SERVER));
        root.addView(server);

        EditText token = new EditText(this);
        token.setHint("DEVICE_TOKEN");
        token.setSingleLine(true);
        token.setText(p.getString(TOKEN, ""));
        root.addView(token);

        Button save = new Button(this);
        save.setText("Save connection");
        save.setOnClickListener(v -> {
            p.edit()
                .putString(SERVER, server.getText().toString().trim().replaceAll("/+$", ""))
                .putString(TOKEN, token.getText().toString().trim())
                .apply();
            testResult = "saved";
        });
        root.addView(save);

        Button test = new Button(this);
        test.setText("Test connection");
        test.setOnClickListener(v -> {
            final String srv = server.getText().toString().trim().replaceAll("/+$", "");
            final String tok = token.getText().toString().trim();
            testResult = "testing...";
            new Thread(() -> {
                String res;
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(srv + "/api/device").openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(8000);
                    c.setRequestProperty("x-device-token", tok);
                    int code = c.getResponseCode();
                    res = code == 200 ? "OK - server reached and token is correct"
                        : code == 401 ? "WRONG TOKEN (401) - re-enter DEVICE_TOKEN"
                        : "server answered HTTP " + code;
                } catch (Exception e) {
                    res = "CANNOT REACH SERVER: " + e.getClass().getSimpleName() + " " + e.getMessage();
                } finally { if (c != null) c.disconnect(); }
                final String out = res;
                ui.post(() -> testResult = out);
            }).start();
        });
        root.addView(test);

        Button battery = new Button(this);
        battery.setText("Keep running in background");
        battery.setOnClickListener(v -> {
            try { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
            catch (Exception e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
        });
        root.addView(battery);

        Button settings = new Button(this);
        settings.setText("Open Accessibility settings");
        settings.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
        root.addView(settings);

        Button web = new Button(this);
        web.setText("Open Rafi AI website");
        web.setOnClickListener(v -> {
            String url = server.getText().toString().trim();
            if (!url.isEmpty()) startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        });
        root.addView(web);

        status = new TextView(this);
        status.setTextSize(15);
        status.setPadding(0, 24, 0, 0);
        root.addView(status);

        ScrollView sv = new ScrollView(this);
        sv.addView(root);
        setContentView(sv);
    }

    @Override protected void onResume() {
        super.onResume();
        startKeepAlive();
        ui.post(refresh);
    }

    @Override protected void onPause() {
        ui.removeCallbacks(refresh);
        super.onPause();
    }
}
