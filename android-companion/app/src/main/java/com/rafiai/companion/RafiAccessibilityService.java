package com.rafiai.companion;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.graphics.Path;
import android.accessibilityservice.GestureDescription;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class RafiAccessibilityService extends AccessibilityService {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean polling = false;

    private final Runnable poller = new Runnable() {
        @Override public void run() {
            if (!polling) return;
            new Thread(() -> pollCommands()).start();
            handler.postDelayed(this, 2500);
        }
    };

    @Override public void onServiceConnected() {
        super.onServiceConnected();
        polling = true;
        handler.post(poller);
    }

    @Override public void onDestroy() {
        polling = false;
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override public void onInterrupt() {}
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {}

    private SharedPreferences prefs() {
        return getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
    }

    private void pollCommands() {
        String server = prefs().getString(MainActivity.SERVER, "").trim();
        String token = prefs().getString(MainActivity.TOKEN, "").trim();
        if (server.isEmpty() || token.isEmpty()) return;

        HttpURLConnection c = null;
        try {
            URL u = new URL(server + "/api/device");
            c = (HttpURLConnection) u.openConnection();
            c.setRequestMethod("GET");
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setRequestProperty("x-device-token", token);
            c.setRequestProperty("Accept", "application/json");
            if (c.getResponseCode() != 200) return;

            JSONObject root = new JSONObject(read(c.getInputStream()));
            JSONArray commands = root.optJSONArray("commands");
            if (commands == null) return;
            for (int i = 0; i < commands.length(); i++) execute(commands.getJSONObject(i));
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private void execute(JSONObject cmd) {
        String id = cmd.optString("id", "");
        String name = cmd.optString("command", "");
        JSONObject args = cmd.optJSONObject("args");
        boolean ok = false;
        String result = "unsupported";

        try {
            if ("home".equals(name)) {
                ok = performGlobalAction(GLOBAL_ACTION_HOME);
                result = ok ? "home opened" : "home failed";
            } else if ("back".equals(name)) {
                ok = performGlobalAction(GLOBAL_ACTION_BACK);
                result = ok ? "back pressed" : "back failed";
            } else if ("recents".equals(name)) {
                ok = performGlobalAction(GLOBAL_ACTION_RECENTS);
                result = ok ? "recents opened" : "recents failed";
            } else if ("notifications".equals(name)) {
                ok = performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS);
                result = ok ? "notifications opened" : "notifications failed";
            } else if ("open_url".equals(name)) {
                String url = args == null ? "" : args.optString("url", "");
                if (!url.isEmpty()) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    ok = true;
                    result = "url launch requested";
                } else result = "missing url";
            } else if ("tap".equals(name)) {
                float x = args == null ? -1 : (float)args.optDouble("x", -1);
                float y = args == null ? -1 : (float)args.optDouble("y", -1);
                ok = tap(x, y);
                result = ok ? "screen tapped" : "tap failed";
            } else if ("tap_text".equals(name)) {
                String text = args == null ? "" : args.optString("text", "");
                ok = tapText(text);
                result = ok ? "text tapped" : "text not found";
            } else if ("type_text".equals(name)) {
                String text = args == null ? "" : args.optString("text", "");
                ok = typeText(text);
                result = ok ? "text entered" : "typing failed";
            } else if ("scroll".equals(name)) {
                ok = scrollForward();
                result = ok ? "scrolled" : "scroll failed";
            } else if ("open_app".equals(name)) {
                String pkg = args == null ? "" : args.optString("packageName", "");
                if (!pkg.isEmpty()) {
                    Intent intent = getPackageManager().getLaunchIntentForPackage(pkg);
                    if (intent != null) {
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                        ok = true;
                        result = "app launch requested";
                    } else result = "app package not found";
                } else result = "missing packageName";
            }
        } catch (Exception e) {
            result = e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage());
        }

        if (!id.isEmpty()) postResult(id, ok ? "done" : "failed", result);
    }

    private boolean tap(float x, float y) {
        if (x < 0 || y < 0) return false;
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(path, 0, 80);
        return dispatchGesture(new GestureDescription.Builder().addStroke(stroke).build(), null, null);
    }

    private AccessibilityNodeInfo findTextNode(AccessibilityNodeInfo node, String text) {
        if (node == null) return null;
        if (text.equalsIgnoreCase(String.valueOf(node.getText()))) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo hit = findTextNode(node.getChild(i), text);
            if (hit != null) return hit;
        }
        return null;
    }

    private boolean tapText(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        AccessibilityNodeInfo hit = findTextNode(root, text);
        if (hit == null) return false;
        boolean ok = hit.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        hit.recycle();
        return ok;
    }

    private boolean typeText(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo focus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (focus == null) return false;
        android.os.Bundle b = new android.os.Bundle();
        b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        boolean ok = focus.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b);
        focus.recycle();
        return ok;
    }

    private boolean scrollForward() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        return scrollNode(root);
    }

    private boolean scrollNode(AccessibilityNodeInfo node) {
        if (node == null) return false;
        if (node.isScrollable() && node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) return true;
        for (int i = 0; i < node.getChildCount(); i++) if (scrollNode(node.getChild(i))) return true;
        return false;
    }

    private void postResult(String id, String status, String result) {
        String server = prefs().getString(MainActivity.SERVER, "").trim();
        String token = prefs().getString(MainActivity.TOKEN, "").trim();
        if (server.isEmpty() || token.isEmpty()) return;

        HttpURLConnection c = null;
        try {
            URL u = new URL(server + "/api/device");
            c = (HttpURLConnection) u.openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setDoOutput(true);
            c.setRequestProperty("x-device-token", token);
            c.setRequestProperty("Content-Type", "application/json");

            JSONObject payload = new JSONObject();
            payload.put("id", id);
            payload.put("status", status);
            payload.put("result", result);

            byte[] data = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = c.getOutputStream()) { out.write(data); }
            c.getResponseCode();
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private String read(InputStream in) throws Exception {
        StringBuilder b = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) b.append(line);
        }
        return b.toString();
    }
}
