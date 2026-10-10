package com.rafiai.companion;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Path;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class RafiAccessibilityService extends AccessibilityService {
    private final Handler handler = new Handler(Looper.getMainLooper());
    // One worker thread: commands run strictly one after another, never twice.
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Set<String> inFlight = new HashSet<>();
    private boolean polling = false;

    private final Runnable poller = new Runnable() {
        @Override public void run() {
            if (!polling) return;
            worker.execute(() -> pollCommands());
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
        worker.shutdownNow();
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
            for (int i = 0; i < commands.length(); i++) {
                JSONObject cmd = commands.getJSONObject(i);
                String id = cmd.optString("id", "");
                if (!id.isEmpty()) {
                    if (inFlight.contains(id)) continue;
                    inFlight.add(id);
                }
                try { execute(cmd); } finally { inFlight.remove(id); }
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String s(JSONObject o, String k) {
        if (o == null) return "";
        String v = o.optString(k, "");
        return "null".equals(v) ? "" : v;
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
                String url = s(args, "url");
                if (!url.isEmpty()) {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    ok = true;
                    result = "url launch requested";
                } else result = "missing url";
            } else if ("tap".equals(name)) {
                float x = args == null ? -1 : (float) args.optDouble("x", -1);
                float y = args == null ? -1 : (float) args.optDouble("y", -1);
                ok = tap(x, y);
                result = ok ? "screen tapped" : "tap failed";
            } else if ("tap_text".equals(name)) {
                ok = tapText(s(args, "text"));
                result = ok ? "text tapped" : "text not found";
            } else if ("type_text".equals(name)) {
                ok = typeText(s(args, "text"));
                result = ok ? "text entered" : "no text field found";
            } else if ("scroll".equals(name)) {
                ok = scrollForward();
                result = ok ? "scrolled" : "scroll failed";
            } else if ("open_app".equals(name)) {
                String pkg = s(args, "packageName");
                if (pkg.isEmpty()) pkg = resolveApp(s(args, "appName"));
                if (!pkg.isEmpty()) {
                    ok = launchPackage(pkg);
                    result = ok ? "app launch requested: " + pkg : "app package not found";
                } else result = "app not found (give appName or packageName)";
            } else if ("whatsapp_send".equals(name)) {
                String phone = s(args, "phone").replaceAll("[^0-9]", "");
                String contactName = s(args, "contactName");
                String text = s(args, "text");
                if (phone.isEmpty() && !contactName.isEmpty()) {
                    phone = ContactResolver.find(this, contactName);
                    if (phone.isEmpty()) {
                        result = "contact not found on this phone (or Contacts permission not allowed): " + contactName;
                        text = "";
                        contactName = "";
                        if (!id.isEmpty()) postResult(id, "failed", result);
                        return;
                    }
                }
                if (phone.isEmpty() || text.isEmpty()) {
                    result = "phone and text are required";
                } else {
                    String r = whatsappSend(phone, text);
                    ok = r.startsWith("sent");
                    result = r;
                }
            }
        } catch (Exception e) {
            result = e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage());
        }

        if (!id.isEmpty()) postResult(id, ok ? "done" : "failed", result);
    }

    /* ---------- apps ---------- */

    private boolean launchPackage(String pkg) {
        Intent intent = getPackageManager().getLaunchIntentForPackage(pkg);
        if (intent == null) return false;
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
        return true;
    }

    /** Find an installed launcher app by its visible name ("WhatsApp", "Chrome" ...). */
    private String resolveApp(String raw) {
        String q = raw == null ? "" : raw.trim().toLowerCase();
        if (q.isEmpty()) return "";
        String[][] alias = {
            {"واٹس", "whatsapp"}, {"व्हाट्स", "whatsapp"},
            {"یوٹیوب", "youtube"}, {"यूट्यूब", "youtube"},
            {"کروم", "chrome"}, {"क्रोम", "chrome"},
            {"جی میل", "gmail"}, {"जीमेल", "gmail"},
            {"کیمرہ", "camera"}, {"कैमरा", "camera"},
            {"سیٹنگ", "settings"}, {"सेटिंग", "settings"},
            {"فیس بک", "facebook"}, {"انسٹاگرام", "instagram"}, {"ٹک ٹاک", "tiktok"},
            {"میپس", "maps"}, {"نقشہ", "maps"}, {"شاپفائی", "shopify"}
        };
        for (String[] a : alias) if (q.contains(a[0])) { q = a[1]; break; }

        PackageManager pm = getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> apps = pm.queryIntentActivities(main, 0);
        String best = "";
        int bestScore = 0;
        for (ResolveInfo ri : apps) {
            String label = String.valueOf(ri.loadLabel(pm)).toLowerCase();
            String pkg = ri.activityInfo.packageName;
            int score = 0;
            if (label.equals(q)) score = 100;
            else if (label.startsWith(q)) score = 80;
            else if (label.contains(q)) score = 60;
            else if (pkg.toLowerCase().contains(q.replace(" ", ""))) score = 40;
            // prefer the normal app over a business/clone variant when tied
            if (score > 0 && pkg.contains("w4b")) score -= 5;
            if (score > bestScore) { bestScore = score; best = pkg; }
        }
        return best;
    }

    /* ---------- WhatsApp ---------- */

    private String whatsappSend(String phone, String text) throws Exception {
        String uri = "https://wa.me/" + phone + "?text=" + URLEncoder.encode(text, "UTF-8");
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        String[] pkgs = {"com.whatsapp", "com.whatsapp.w4b"};
        boolean launched = false;
        for (String p : pkgs) {
            if (getPackageManager().getLaunchIntentForPackage(p) != null) {
                intent.setPackage(p);
                launched = true;
                break;
            }
        }
        if (!launched) return "WhatsApp is not installed on this phone";
        startActivity(intent);

        // wait for the chat screen to appear with the text prefilled, then press the Send button
        for (int i = 0; i < 12; i++) {
            Thread.sleep(1000);
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) continue;
            AccessibilityNodeInfo send = findSend(root);
            if (send != null) {
                Thread.sleep(400);
                boolean clicked = clickNode(send);
                if (clicked) return "sent via WhatsApp to " + phone;
            }
        }
        return "WhatsApp opened with the message but the Send button was not found (message is typed, tap Send)";
    }

    private AccessibilityNodeInfo findSend(AccessibilityNodeInfo node) {
        if (node == null) return null;
        List<AccessibilityNodeInfo> byId = node.findAccessibilityNodeInfosByViewId("com.whatsapp:id/send");
        if (byId != null && !byId.isEmpty()) return byId.get(0);
        List<AccessibilityNodeInfo> byIdB = node.findAccessibilityNodeInfosByViewId("com.whatsapp.w4b:id/send");
        if (byIdB != null && !byIdB.isEmpty()) return byIdB.get(0);
        return findByLabel(node, new String[]{"send", "بھیجیں", "भेजें"}, true);
    }

    /* ---------- generic UI helpers ---------- */

    private boolean tap(float x, float y) {
        if (x < 0 || y < 0) return false;
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(path, 0, 80);
        return dispatchGesture(new GestureDescription.Builder().addStroke(stroke).build(), null, null);
    }

    private boolean matches(AccessibilityNodeInfo n, String[] labels, boolean exact) {
        String t = n.getText() == null ? "" : n.getText().toString().trim().toLowerCase();
        String d = n.getContentDescription() == null ? "" : n.getContentDescription().toString().trim().toLowerCase();
        for (String l : labels) {
            String q = l.toLowerCase();
            if (q.isEmpty()) continue;
            if (exact) { if (t.equals(q) || d.equals(q)) return true; }
            else if (t.contains(q) || d.contains(q)) return true;
        }
        return false;
    }

    private AccessibilityNodeInfo findByLabel(AccessibilityNodeInfo node, String[] labels, boolean exact) {
        if (node == null) return null;
        if (matches(node, labels, exact)) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo hit = findByLabel(node.getChild(i), labels, exact);
            if (hit != null) return hit;
        }
        return null;
    }

    /** Click the node, or the nearest clickable parent (many buttons are wrapped). */
    private boolean clickNode(AccessibilityNodeInfo n) {
        AccessibilityNodeInfo cur = n;
        for (int depth = 0; cur != null && depth < 6; depth++) {
            if (cur.isClickable() && cur.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
            cur = cur.getParent();
        }
        return false;
    }

    private boolean tapText(String text) {
        if (text.isEmpty()) return false;
        for (int attempt = 0; attempt < 3; attempt++) {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null) {
                AccessibilityNodeInfo hit = findByLabel(root, new String[]{text}, true);
                if (hit == null) hit = findByLabel(root, new String[]{text}, false);
                if (hit != null && clickNode(hit)) return true;
            }
            try { Thread.sleep(700); } catch (InterruptedException e) { return false; }
        }
        return false;
    }

    private AccessibilityNodeInfo findEditable(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isEditable()) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo hit = findEditable(node.getChild(i));
            if (hit != null) return hit;
        }
        return null;
    }

    private boolean typeText(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo field = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (field == null) field = findEditable(root);
        if (field == null) return false;
        field.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        Bundle b = new Bundle();
        b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        return field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b);
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

    /* ---------- reporting ---------- */

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
