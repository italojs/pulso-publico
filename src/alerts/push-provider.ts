import webPush from "web-push";

export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

interface VapidConfig {
  subject?: string;
  publicKey?: string;
  privateKey?: string;
}

interface PushSender {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(subscription: StoredPushSubscription, payload: string): Promise<unknown>;
}

export class WebPushProvider {
  readonly available: boolean;
  private readonly sender: PushSender;

  constructor(config: VapidConfig, sender: PushSender = webPush) {
    this.sender = sender;
    this.available = Boolean(config.subject && config.publicKey && config.privateKey);
    if (config.subject && config.publicKey && config.privateKey) {
      this.sender.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    }
  }

  async send(subscription: StoredPushSubscription, payload: PushPayload): Promise<"sent" | "expired" | "disabled"> {
    if (!this.available) return "disabled";
    try {
      await this.sender.sendNotification(subscription, JSON.stringify(payload));
      return "sent";
    } catch (error) {
      const statusCode = error && typeof error === "object" ? Reflect.get(error, "statusCode") : null;
      if (statusCode === 404 || statusCode === 410) return "expired";
      throw error;
    }
  }
}
