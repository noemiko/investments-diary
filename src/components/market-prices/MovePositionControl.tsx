import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MarketCurrency, Wallet } from "@/types";
import { actionMessage, priceAction, refreshPriceFragments } from "./client";

type MoveResult = { ok: true } | { ok: false; reason: string };
export function MovePositionControl({
  positionId,
  walletId,
  sourceCurrency,
  wallets,
}: {
  positionId: string;
  walletId: string;
  sourceCurrency: MarketCurrency;
  wallets: Wallet[];
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [currentWallet, setCurrentWallet] = useState(walletId);
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const choices = wallets.filter((wallet) => wallet.id !== currentWallet && wallet.currency === sourceCurrency);
  async function move() {
    if (pending.current || !target) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await priceAction<MoveResult>(`/dashboard/positions/${positionId}/move`, {
        wallet_id: target,
      });
      if (!result.ok) {
        setMessage(actionMessage(result.reason));
        return;
      }
      setCurrentWallet(target);
      setTarget("");
      try {
        await refreshPriceFragments();
        setMessage("Position moved. Its recorded facts and prior wallet observations are unchanged.");
      } catch {
        setMessage(
          "Position moved, but the wallet link could not be refreshed. Your other form input is unchanged. Reload when ready.",
        );
      }
    } catch {
      setMessage(
        "This position could not be moved. Your selection and other form input are unchanged. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="move-position-heading">
      <h2 id="move-position-heading" className="text-lg font-semibold">
        Move to another wallet
      </h2>
      <p className="text-muted-foreground text-sm">
        Moving an open or closed position affects current and future totals. Earlier observations stay unchanged.
      </p>
      {!choices.length ? (
        <p className="text-muted-foreground text-sm">
          No other wallet with a compatible currency is available. Create a target wallet first.
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void move();
          }}
        >
          <label htmlFor="move-wallet" className="block text-sm">
            Target wallet
          </label>
          <select
            id="move-wallet"
            value={target}
            disabled={busy}
            required
            onChange={(event) => {
              setTarget(event.target.value);
            }}
            className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2"
          >
            <option value="" className="bg-popover text-popover-foreground">
              Choose a wallet
            </option>
            {choices.map((wallet) => (
              <option key={wallet.id} value={wallet.id} className="bg-popover text-popover-foreground">
                {wallet.name} · {wallet.currency}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" disabled={busy || !target}>
            {busy ? "Moving…" : "Move position"}
          </Button>
        </form>
      )}
      <p role="status" aria-live="polite" className="text-sm">
        {message}
      </p>
    </section>
  );
}
