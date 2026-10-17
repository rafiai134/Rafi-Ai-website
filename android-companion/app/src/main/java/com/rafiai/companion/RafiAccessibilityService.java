package com.rafiai.companion;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Path;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
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
    private static boolean crashHookSet = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    // Polling has its own thread so a hung network call can never block commands, and a watchdog replaces it if it hangs.
    private volatile ExecutorService pollExec = Executors.newSingleThreadExecutor();
    // Commands run strictly one after another on their own thread, never twice.
    private final ExecutorService cmdExec = Executors.newSingleThreadExecutor();
    private final Set<String> inFlight = new HashSet<>();
    private final Set<String> finished = new HashSet<>();
    private volatile long pollStartedAt = 0;
    private volatile long pollGen = 0;
    private boolean polling = false;

    // the last app window the phone told us about (used when the active window cannot be read for a moment)
    private volatile String lastPkg = "";
    private volatile long lastPkgAt = 0;

    private final Runnable poller = new Runnable() {
        @Override public void run() {
            if (!polling) return;
            try {
                long now = System.currentTimeMillis();
                try { prefs().edit().putLong("hb", now).apply(); } catch (Throwable ignored) {}
                long started = pollStartedAt;
                if (started != 0 && now - started > 20000) {
                    // the previous poll hung (network change, DNS, dead socket): abandon its thread and start a fresh one
                    try { pollExec.shutdownNow(); } catch (Throwable ignored) {}
                    pollExec = Executors.newSingleThreadExecutor();
                    pollStartedAt = 0;
                    int n = prefs().getInt("restarts", 0) + 1;
                    prefs().edit().putInt("restarts", n).apply();
                    note("previous poll hung for 20s - restarted it (#" + n + ")");
                }
                if (pollStartedAt == 0) {
                    final long gen = ++pollGen;
                    pollStartedAt = now;
                    try {
                        pollExec.execute(() -> {
                            try { pollCommands(); }
                            catch (Throwable t) { note("poll crashed: " + t.getClass().getSimpleName() + " " + t.getMessage()); }
                            finally { if (pollGen == gen) pollStartedAt = 0; }
                        });
                    } catch (Throwable e) {
                        pollStartedAt = 0;
                        note("worker error: " + e.getClass().getSimpleName());
                    }
                }
            } catch (Throwable t) {
                try { prefs().edit().putString("last_err", "poller: " + t.getClass().getSimpleName() + " " + t.getMessage()).apply(); } catch (Throwable ignored) {}
            } finally {
                // the loop must never stop because of an error
                if (polling) handler.postDelayed(this, 2500);
            }
        }
    };

    @Override public void onServiceConnected() {
        super.onServiceConnected();
        installCrashHook();
        polling = true;
        prefs().edit().putLong("svc_started", System.currentTimeMillis()).apply();
        note("service connected, waiting for first poll");
        handler.removeCallbacks(poller);
        handler.post(poller);
    }

    @Override public boolean onUnbind(Intent intent) {
        try { prefs().edit().putLong("svc_unbound", System.currentTimeMillis()).apply(); } catch (Throwable ignored) {}
        return super.onUnbind(intent);
    }

    @Override public void onDestroy() {
        try { prefs().edit().putLong("svc_destroyed", System.currentTimeMillis()).apply(); } catch (Throwable ignored) {}
        polling = false;
        handler.removeCallbacksAndMessages(null);
        try { pollExec.shutdownNow(); } catch (Throwable ignored) {}
        cmdExec.shutdownNow();
        super.onDestroy();
    }

    /** If the app ever crashes, remember why so the Status can show it. */
    private void installCrashHook() {
        if (crashHookSet) return;
        crashHookSet = true;
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        final SharedPreferences sp = prefs();
        Thread.setDefaultUncaughtExceptionHandler((th, ex) -> {
            try {
                String where = ex.getStackTrace().length > 0 ? ex.getStackTrace()[0].toString() : "";
                String msg = ex.getClass().getSimpleName() + ": " + ex.getMessage() + " @ " + where;
                if (msg.length() > 300) msg = msg.substring(0, 300);
                sp.edit().putLong("crash_at", System.currentTimeMillis()).putString("crash", msg).commit();
            } catch (Throwable ignored) {}
            if (prev != null) prev.uncaughtException(th, ex);
        });
    }

    @Override public void onInterrupt() {}

    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        try {
            if (event == null || event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
            CharSequence cp = event.getPackageName();
            if (cp == null) return;
            String p = cp.toString();
            String l = p.toLowerCase();
            if (l.equals("com.android.systemui") || l.contains("inputmethod") || p.equals(getPackageName())) return;
            lastPkg = p;
            lastPkgAt = System.currentTimeMillis();
        } catch (Throwable ignored) {}
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
    }

    /** Visible in the app's Status line. */
    private void note(String result) {
        try {
            prefs().edit().putLong("last_poll_at", System.currentTimeMillis()).putString("last_poll_res", result).apply();
        } catch (Exception ignored) {}
    }

    /** Last executed command and its result, visible in the app's Status. */
    private void rec(String name, String res) {
        try {
            if (res != null && res.length() > 220) res = res.substring(0, 220);
            prefs().edit().putLong("last_cmd_at", System.currentTimeMillis())
                .putString("last_cmd", name).putString("last_cmd_res", res).apply();
        } catch (Exception ignored) {}
    }

    private void pollCommands() {
        String server = prefs().getString(MainActivity.SERVER, "").trim();
        String token = prefs().getString(MainActivity.TOKEN, "").trim();
        if (server.isEmpty() || token.isEmpty()) { note("no server or token saved - press Save connection"); return; }

        HttpURLConnection c = null;
        try {
            URL u = new URL(server + "/api/device");
            c = (HttpURLConnection) u.openConnection();
            c.setRequestMethod("GET");
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setUseCaches(false);
            c.setRequestProperty("Connection", "close");
            c.setRequestProperty("x-device-token", token);
            c.setRequestProperty("Accept", "application/json");
            int code = c.getResponseCode();
            if (code != 200) { note(code == 401 ? "HTTP 401 WRONG TOKEN" : "HTTP " + code); return; }

            JSONObject root = new JSONObject(read(c.getInputStream()));
            JSONArray commands = root.optJSONArray("commands");
            int n = commands == null ? 0 : commands.length();
            note("OK (HTTP 200), commands waiting: " + n);
            if (commands == null) return;
            for (int i = 0; i < commands.length(); i++) {
                final JSONObject cmd = commands.getJSONObject(i);
                final String id = cmd.optString("id", "");
                if (!id.isEmpty()) {
                    synchronized (inFlight) {
                        if (inFlight.contains(id) || finished.contains(id)) continue;
                        inFlight.add(id);
                    }
                }
                try {
                    cmdExec.execute(() -> {
                        try { execute(cmd); }
                        catch (Throwable t) { rec(cmd.optString("command", "?"), "FAILED: " + t.getClass().getSimpleName() + " " + t.getMessage()); }
                        finally {
                            synchronized (inFlight) {
                                inFlight.remove(id);
                                if (!id.isEmpty()) {
                                    if (finished.size() > 200) finished.clear();
                                    finished.add(id);
                                }
                            }
                        }
                    });
                } catch (Exception e) {
                    synchronized (inFlight) { inFlight.remove(id); }
                }
            }
        } catch (Exception e) {
            note("error: " + e.getClass().getSimpleName() + " " + String.valueOf(e.getMessage()));
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String s(JSONObject o, String k) {
        if (o == null) return "";
        String v = o.optString(k, "");
        return v == null ? "" : v.trim();
    }

    private void execute(JSONObject cmd) {
        String id = cmd.optString("id", "");
        String name = cmd.optString("command", "");
        JSONObject args = cmd.optJSONObject("args");
        boolean ok = false;
        String result = "unsupported";
        boolean quiet = "read_screen".equals(name);
        if (!quiet) rec(name, "running...");

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
            } else if ("read_screen".equals(name)) {
                String dump = dumpScreen();
                ok = !dump.isEmpty();
                result = ok ? dump : "screen not readable";
            } else if ("enter".equals(name)) {
                ok = pressEnter();
                result = ok ? "enter pressed" : "enter failed (no focused field)";
            } else if ("scroll_up".equals(name)) {
                ok = scrollBack();
                result = ok ? "scrolled back" : "scroll back failed";
            } else if ("open_url".equals(name)) {
                String url = s(args, "url");
                if (!url.isEmpty()) {
                    String before = fgPkg();
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                    if (waitMoved(before, 3500, true)) {
                        ok = true;
                        result = "url opened (foreground: " + fgPkg() + ")";
                    } else {
                        result = "url did not open (foreground is " + fgPkg() + "). Background start may be blocked by the phone.";
                    }
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
                    String r = openAppVerified(pkg);
                    ok = r.startsWith("OK");
                    result = r;
                } else result = "app not found (give appName or packageName)";
            } else if ("whatsapp_send".equals(name)) {
                String phone = s(args, "phone").replaceAll("[^0-9]", "");
                String contactName = s(args, "contactName");
                String text = s(args, "text");
                String who = "";
                if (phone.isEmpty() && !contactName.isEmpty()) {
                    String[] f = ContactResolver.findDetailed(this, contactName);
                    phone = f[0];
                    who = f[1];
                    if (phone.isEmpty()) {
                        String msg = f[2].isEmpty() ? "contact not found on this phone: " + contactName : f[2];
                        rec(name, "FAILED: " + msg);
                        if (!id.isEmpty()) postResult(id, "failed", msg);
                        return;
                    }
                }
                if (phone.isEmpty() || text.isEmpty()) {
                    result = "phone and text are required";
                } else {
                    String r = whatsappSend(phone, text);
                    ok = r.startsWith("sent") || r.startsWith("tapped");
                    result = who.isEmpty() ? r : r + " [contact: " + who + "]";
                }
            }
        } catch (Exception e) {
            result = e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage());
        }

        if (!quiet) rec(name, (ok ? "done: " : "FAILED: ") + result);
        if (!id.isEmpty()) postResult(id, ok ? "done" : "failed", result);
    }

    /* ---------- foreground checks ---------- */

    /** Package of the app that is on screen right now ("" if unknown). */
    private String fgPkg() {
        String root = "";
        try {
            AccessibilityNodeInfo r = getRootInActiveWindow();
            if (r != null && r.getPackageName() != null) root = r.getPackageName().toString();
        } catch (Exception ignored) {}
        if (!root.isEmpty()) return root;
        // the active window could not be read right now: use the last window the phone reported
        return (System.currentTimeMillis() - lastPkgAt < 20000) ? lastPkg : "";
    }

    private boolean isSystemUi(String p) {
        String l = p.toLowerCase();
        return l.isEmpty() || l.contains("launcher") || l.equals("com.android.systemui") || l.equals("com.miui.home")
            || l.equals("com.rafiai.companion2");
    }

    private boolean isBrowser(String p) {
        String l = p.toLowerCase();
        return l.contains("chrome") || l.contains("browser") || l.contains("firefox") || l.contains("opera") || l.contains("brave");
    }

    /** True when some real app (not the launcher/system UI) is now in front and it changed from `before` (or is a browser). */
    private boolean waitMoved(String before, int ms, boolean browserOk) throws InterruptedException {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            String cur = fgPkg();
            if (!isSystemUi(cur) && (!cur.equals(before) || (browserOk && isBrowser(cur)))) return true;
            Thread.sleep(300);
        }
        return false;
    }

    private boolean waitFgPrefix(String prefix, int ms) throws InterruptedException {
        long end = System.currentTimeMillis() + ms;
        while (System.currentTimeMillis() < end) {
            if (fgPkg().startsWith(prefix)) return true;
            Thread.sleep(300);
        }
        return false;
    }

    /* ---------- screen reading (for the phone agent) ---------- */

    private String dumpScreen() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "";
        StringBuilder sb = new StringBuilder();
        sb.append("app: ").append(root.getPackageName()).append('\n');
        int[] count = new int[]{0};
        dumpNode(root, sb, count, 0);
        return sb.toString();
    }

    private void dumpNode(AccessibilityNodeInfo n, StringBuilder sb, int[] count, int depth) {
        if (n == null || sb.length() > 3600 || count[0] > 90 || depth > 30) return;
        if (n.isVisibleToUser()) {
            String label = "";
            if (n.getText() != null && n.getText().length() > 0) label = n.getText().toString();
            else if (n.getContentDescription() != null) label = n.getContentDescription().toString();
            label = label.replace('\n', ' ').replace('|', '/').trim();
            if (label.length() > 50) label = label.substring(0, 50);
            boolean c = n.isClickable(), e = n.isEditable(), sc = n.isScrollable();
            if (!label.isEmpty() || c || e || sc) {
                Rect r = new Rect();
                n.getBoundsInScreen(r);
                if (!r.isEmpty()) {
                    sb.append(label).append('|')
                      .append(c ? "c" : "").append(e ? "e" : "").append(sc ? "s" : "").append('|')
                      .append(r.centerX()).append(',').append(r.centerY()).append('\n');
                    count[0]++;
                }
            }
        }
        for (int i = 0; i < n.getChildCount(); i++) dumpNode(n.getChild(i), sb, count, depth + 1);
    }

    private boolean pressEnter() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo f = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (f == null) f = findEditable(root);
        if (f == null) return false;
        if (Build.VERSION.SDK_INT >= 30) {
            return f.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
        }
        return false;
    }

    private boolean scrollBack() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        return scrollNodeBack(root);
    }

    private boolean scrollNodeBack(AccessibilityNodeInfo node) {
        if (node == null) return false;
        if (node.isScrollable() && node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) return true;
        for (int i = 0; i < node.getChildCount(); i++) if (scrollNodeBack(node.getChild(i))) return true;
        return false;
    }

    /* ---------- apps ---------- */

    private String appLabel(String pkg) {
        try {
            PackageManager pm = getPackageManager();
            return String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)));
        } catch (Exception e) { return ""; }
    }

    /**
     * Open an app and CHECK that it really came to the front.
     * 1) normal launch intent; 2) if the phone blocks background launches, go Home and tap the app icon like a person would.
     */
    private String openAppVerified(String pkg) throws InterruptedException {
        Intent intent = getPackageManager().getLaunchIntentForPackage(pkg);
        if (intent == null) return "app package not found: " + pkg;
        String before = fgPkg();
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(intent); } catch (Exception e) { /* fall through to icon method */ }
        if (fgPkg().equals(pkg) || waitMoved(before, 3500, false)) {
            return "OK opened " + pkg + " (foreground: " + fgPkg() + ")";
        }
        String label = appLabel(pkg);
        if (!label.isEmpty() && tapLauncherIcon(label)) {
            if (waitMoved("", 4000, false)) return "OK opened " + pkg + " by tapping its icon (foreground: " + fgPkg() + ")";
        }
        return pkg + " did not come to the front (foreground is " + fgPkg() + "). The phone is blocking background start, or the icon was not found.";
    }

    /** Go Home, find the icon by its label (open the app drawer if needed) and tap it. */
    private boolean tapLauncherIcon(String label) throws InterruptedException {
        performGlobalAction(GLOBAL_ACTION_HOME);
        Thread.sleep(1000);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        for (int attempt = 0; attempt < 6; attempt++) {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null) {
                AccessibilityNodeInfo hit = findByLabel(root, new String[]{label}, true);
                if (hit == null && label.length() > 3) hit = findByLabel(root, new String[]{label}, false);
                if (hit != null && (clickNode(hit) || clickBounds(hit))) return true;
            }
            // swipe up: opens the app drawer first time, then scrolls through it
            swipe(dm.widthPixels / 2f, dm.heightPixels * 0.82f, dm.widthPixels / 2f, dm.heightPixels * 0.25f);
            Thread.sleep(1000);
        }
        return false;
    }

    private boolean swipe(float x1, float y1, float x2, float y2) {
        Path path = new Path();
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
        GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(path, 0, 350);
        return dispatchGesture(new GestureDescription.Builder().addStroke(stroke).build(), null, null);
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
            {"میپس", "maps"}, {"نقشہ", "maps"}, {"شاپفائی", "shopify"},
            {"گیلری", "gallery"}, {"गैलरी", "gallery"}
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

        // 1) open the chat and CHECK WhatsApp is really in front (retry once from Home)
        try { startActivity(intent); } catch (Exception ignored) {}
        if (!waitFgPrefix("com.whatsapp", 8000)) {
            performGlobalAction(GLOBAL_ACTION_HOME);
            Thread.sleep(800);
            try { startActivity(intent); } catch (Exception ignored) {}
            if (!waitFgPrefix("com.whatsapp", 8000)) {
                return "WhatsApp did not come to the front (foreground is " + fgPkg() + "). The phone is blocking background start of WhatsApp. Nothing was sent.";
            }
        }

        // 2) wait for the Send button of the prefilled chat, only while WhatsApp is in front, then press it
        for (int i = 0; i < 14; i++) {
            Thread.sleep(1000);
            if (!fgPkg().startsWith("com.whatsapp")) continue;
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root == null) continue;
            AccessibilityNodeInfo send = findSend(root);
            String how = "label";
            if (send == null && i >= 5) { send = findBottomRightButton(root); how = "position"; }
            if (send == null) continue;
            Thread.sleep(500);
            boolean clicked = clickNode(send) || clickBounds(send);
            if (!clicked) continue;
            // 3) confirm: after a real send the Send button turns back into the microphone
            Thread.sleep(1500);
            AccessibilityNodeInfo after = getRootInActiveWindow();
            boolean stillThere = after != null && findSend(after) != null;
            if (!stillThere) return "sent via WhatsApp to " + phone + " (" + how + ", confirmed)";
            return "tapped Send in WhatsApp for " + phone + " (" + how + ") but could not confirm it was delivered - check the chat";
        }
        return "WhatsApp opened but the Send button was not found (" + fgPkg() + "). The message may be typed but not sent";
    }

    private AccessibilityNodeInfo findSend(AccessibilityNodeInfo node) {
        if (node == null) return null;
        List<AccessibilityNodeInfo> byId = node.findAccessibilityNodeInfosByViewId("com.whatsapp:id/send");
        if (byId != null && !byId.isEmpty()) return byId.get(0);
        List<AccessibilityNodeInfo> byIdB = node.findAccessibilityNodeInfosByViewId("com.whatsapp.w4b:id/send");
        if (byIdB != null && !byIdB.isEmpty()) return byIdB.get(0);
        AccessibilityNodeInfo exact = findByLabel(node, new String[]{"send", "بھیجیں", "भेजें"}, true);
        if (exact != null) return exact;
        return findByDescriptionContains(node, "send");
    }

    /** Any node whose content description (not text) contains the word, e.g. "Send message". */
    private AccessibilityNodeInfo findByDescriptionContains(AccessibilityNodeInfo n, String word) {
        if (n == null) return null;
        CharSequence d = n.getContentDescription();
        if (d != null && d.toString().toLowerCase().contains(word)) return n;
        String id = n.getViewIdResourceName();
        if (id != null && id.toLowerCase().endsWith("/" + word)) return n;
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo hit = findByDescriptionContains(n.getChild(i), word);
            if (hit != null) return hit;
        }
        return null;
    }

    /** The clickable control furthest to the bottom-right (with text prefilled this is the Send button). */
    private AccessibilityNodeInfo findBottomRightButton(AccessibilityNodeInfo root) {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        AccessibilityNodeInfo[] best = new AccessibilityNodeInfo[1];
        int[] bestScore = new int[]{-1};
        scanBottomRight(root, dm.widthPixels, dm.heightPixels, best, bestScore);
        return best[0];
    }

    private void scanBottomRight(AccessibilityNodeInfo n, int w, int h, AccessibilityNodeInfo[] best, int[] bestScore) {
        if (n == null) return;
        Rect r = new Rect();
        n.getBoundsInScreen(r);
        int cx = r.centerX(), cy = r.centerY();
        if (n.isClickable() && n.isVisibleToUser() && cx > w * 0.80 && cy > h * 0.55 && r.width() > 40 && r.width() < w * 0.30) {
            int score = cx + cy;
            if (score > bestScore[0]) { bestScore[0] = score; best[0] = n; }
        }
        for (int i = 0; i < n.getChildCount(); i++) scanBottomRight(n.getChild(i), w, h, best, bestScore);
    }

    private boolean clickBounds(AccessibilityNodeInfo n) {
        Rect r = new Rect();
        n.getBoundsInScreen(r);
        if (r.isEmpty()) return false;
        return tap(r.centerX(), r.centerY());
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
                if (hit != null && (clickNode(hit) || clickBounds(hit))) return true;
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
            c.setReadTimeout(15000);
            c.setUseCaches(false);
            c.setRequestProperty("Connection", "close");
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
