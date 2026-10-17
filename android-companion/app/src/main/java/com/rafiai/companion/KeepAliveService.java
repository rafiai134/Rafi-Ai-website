package com.rafiai.companion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * A plain foreground service with a small notification. Its only job is to make the phone treat this app as
 * "in use" so Xiaomi/MIUI stops killing the process (and with it the Accessibility service).
 */
public class KeepAliveService extends Service {
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences sp = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            nm.createNotificationChannel(new NotificationChannel("rafi_keep", "Rafi AI running", NotificationManager.IMPORTANCE_LOW));
            Notification.Builder b = new Notification.Builder(this, "rafi_keep");
            b.setContentTitle("Rafi AI is running")
             .setContentText("Tap to open the Companion")
             .setSmallIcon(android.R.drawable.ic_dialog_info)
             .setOngoing(true);
            PendingIntent pi = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
            b.setContentIntent(pi);
            Notification n = b.build();
            if (Build.VERSION.SDK_INT >= 34) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(7, n);
            sp.edit().putLong("fg_ok", System.currentTimeMillis()).remove("fg_err").apply();
        } catch (Throwable t) {
            try { sp.edit().putString("fg_err", t.getClass().getSimpleName() + ": " + t.getMessage()).apply(); } catch (Throwable ignored) {}
        }
        return START_STICKY;
    }
}
