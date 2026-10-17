package com.rafiai.companion;

import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.ContactsContract;

import java.util.LinkedHashMap;
import java.util.Map;

public class ContactResolver {
    private static String norm(String s) {
        if (s == null) return "";
        return s.toLowerCase().replaceAll("[^\\p{L}\\p{N}]", "");
    }

    /** Digits-only international number for a saved contact name, or "" if there is no single clear match. */
    public static String find(Context ctx, String name) {
        return findDetailed(ctx, name)[0];
    }

    /**
     * Returns {number, displayName, problem}. number is "" unless exactly one contact clearly matches.
     * A name must match a saved contact exactly ("Bilal Bro" never becomes "Bilal Brother").
     * A single word may match by prefix only when it fits exactly one contact.
     */
    public static String[] findDetailed(Context ctx, String name) {
        String[] out = new String[]{"", "", ""};
        if (name == null || name.trim().isEmpty()) { out[2] = "no contact name was given"; return out; }
        if (ctx.checkSelfPermission(android.Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            out[2] = "Contacts permission is not allowed for the Companion app";
            return out;
        }
        String q = name.trim();
        String nq = norm(q);
        if (nq.isEmpty()) { out[2] = "contact name is empty: " + q; return out; }

        // the longest word narrows the database search; the exact decision is made below
        String key = q;
        for (String w : q.split("\\s+")) if (w.length() > 0 && (key.equals(q) || w.length() > key.length() || key.contains(" "))) key = w;
        if (key.contains(" ")) key = q.split("\\s+")[0];

        Cursor c = null;
        try {
            c = ctx.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER},
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " LIKE ?",
                new String[]{"%" + key + "%"}, null);
            Map<String, String> found = new LinkedHashMap<>();
            while (c != null && c.moveToNext()) {
                String dn = String.valueOf(c.getString(0)).trim();
                String num = c.getString(1);
                if (num == null || num.trim().isEmpty()) continue;
                if (!found.containsKey(dn)) found.put(dn, num);
            }
            // 1) exact name
            for (Map.Entry<String, String> e : found.entrySet()) {
                if (norm(e.getKey()).equals(nq)) {
                    out[0] = normalize(e.getValue());
                    out[1] = e.getKey();
                    return out;
                }
            }
            // 2) one word that fits exactly one contact
            if (!q.contains(" ") && found.size() == 1) {
                Map.Entry<String, String> e = found.entrySet().iterator().next();
                out[0] = normalize(e.getValue());
                out[1] = e.getKey();
                return out;
            }
            if (found.isEmpty()) {
                out[2] = "no contact named " + q + " on this phone";
            } else {
                StringBuilder sb = new StringBuilder();
                int n = 0;
                for (String k : found.keySet()) { if (n++ >= 5) break; if (sb.length() > 0) sb.append(", "); sb.append(k); }
                out[2] = (q.contains(" ") ? "no contact named exactly " + q : "several contacts match " + q)
                    + ". Similar: " + sb + ". Say the full saved name.";
            }
            return out;
        } catch (Exception e) {
            out[2] = "contacts lookup failed: " + e.getClass().getSimpleName();
            return out;
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
