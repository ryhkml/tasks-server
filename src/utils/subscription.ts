import { Subscription } from "rxjs";

class SubscriptionManager {
	private readonly subscription = new Map<string, Subscription>();

	add(id: string, v: Subscription): boolean {
		if (this.subscription.has(id)) {
			return false;
		}
		this.subscription.set(id, v);
		return true;
	}

	size(): number {
		return this.subscription.size;
	}

	unsubscribe(id: string): boolean {
		const subscription = this.subscription.get(id);
		if (subscription) {
			if (subscription.closed) {
				this.subscription.delete(id);
			} else {
				subscription.unsubscribe();
				this.subscription.delete(id);
			}
			return true;
		}
		return false;
	}

	unsubscribeAll(): void {
		for (const [_, sub] of this.subscription) {
			sub.unsubscribe();
		}
		this.subscription.clear();
	}
}

export const subscriptionManager = new SubscriptionManager();
