import { LocalNotifications } from "@capacitor/local-notifications";

const NOTIF_IDS = { morning: 1001, evening: 1002 };

export async function requestAndScheduleNotifications() {
  try {
    const { display } = await LocalNotifications.requestPermissions();
    if (display !== "granted") return false;

    await LocalNotifications.cancel({
      notifications: Object.values(NOTIF_IDS).map(id => ({ id })),
    });

    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIF_IDS.morning,
          title: "Gossip Morning Briefing",
          body: "Fresh Solana intelligence is ready. Tap to read.",
          schedule: { on: { hour: 7, minute: 30 }, allowWhileIdle: true, repeats: true },
          smallIcon: "ic_stat_gossip",
          iconColor: "#14F195",
        },
        {
          id: NOTIF_IDS.evening,
          title: "Gossip Evening Briefing",
          body: "Your evening Solana intel drop has landed.",
          schedule: { on: { hour: 19, minute: 30 }, allowWhileIdle: true, repeats: true },
          smallIcon: "ic_stat_gossip",
          iconColor: "#14F195",
        },
      ],
    });

    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error("Notification scheduling failed:", err);
    return false;
  }
}

export async function cancelNotifications() {
  try {
    await LocalNotifications.cancel({
      notifications: Object.values(NOTIF_IDS).map(id => ({ id })),
    });
  } catch {
    // ignore — nothing scheduled or plugin unavailable
  }
}
