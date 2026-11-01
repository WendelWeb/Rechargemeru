/**
 * The switch that closes the shop: `true` and no new order can be created.
 *
 * The home page then says the recharge is coming back very soon and stops the
 * form at its first screen, and `POST /api/orders` refuses whatever a tab left
 * open still sends. Orders that already exist are untouched: they can still be
 * paid, tracked and fulfilled.
 *
 * To reopen, set it back to `false` and deploy.
 */
export const ORDERS_PAUSED: boolean = true;
