package com.rafiai.companion;

import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.ContactsContract;

public class ContactResolver {
    /** Returns digits-only international number for a saved contact name, or "" if not found / no permission. */
    public static String find(Context ctx, String name) {
        if (name == null || name.trim().isEmpty()) return "";
        if (ctx.checkSelfPermission(android.Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return "";
        String q = name.trim();
        Cursor c = null;
        try {
            c = ctx.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER},
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?",
                new String[]{"%" + q + "%"}, null);
            String best = "";
            int bestScore = 0;
            while (c != null && c.moveToNext()) {
                String dn = String.valueOf(c.getString(0)).trim().toLowerCase();
                String num = c.getString(1);
                if (num == null) continue;
                int score = dn.equals(q.toLowerCase()) ? 100 : (dn.startsWith(q.toLowerCase()) ? 80 : 50);
                if (score > bestScore) { bestScore = score; best = num; }
            }
            return normalize(best);
        } catch (Exception e) {
            return "";
        } finally {
            if (c != null) c.close();
        }
    }

    static String normalize(String raw) {
        if (raw == null) return "";
        boolean plus = raw.trim().startsWith("+");
        String d = raw.replaceAll("[^0-9]", "");
        if (d.isEmpty()) return "";
        if (plus) return d;
        if (d.startsWith("00")) return d.substring(2);
        if (d.startsWith("0")) return "92" + d.substring(1); // Pakistan local format
        return d;
    }
}
