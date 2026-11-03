import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Briefcase, Calendar, CircleAlert, Hash, Save, Search, Tag, Wallet } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ConfrontationPanel } from "@/components/positions/ConfrontationPanel";
import { STOCK_SEARCH_COPY, searchStockListings } from "@/components/positions/stock-search";
import { confrontationState } from "@/lib/confrontation";
import { parseDecimal } from "@/lib/validation/decimal";
import { cn } from "@/lib/utils";
import {
  NEW_CATEGORY_CHOICE as NEW_CATEGORY,
  type PositionFormErrors,
  type PositionFormField,
  type ConfrontationPosition,
  type PositionFormValues,
  type ReasonCategory,
  type Wallet as WalletOption,
  type MarketSelectionChoice,
} from "@/types";

const controlBase =
  "w-full rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none";

interface Props {
  categories: ReasonCategory[];
  /** The author's wallets (FR-013); every position must belong to one. */
  wallets: WalletOption[];
  values: PositionFormValues;
  errors: PositionFormErrors;
  /** The author's earlier positions; `null` when they could not be loaded. */
  earlierPositions: ConfrontationPosition[] | null;
  listingChoices?: MarketSelectionChoice[];
  selectedListing?: MarketSelectionChoice | null;
  listingSearched?: boolean;
}

// Mirrors the server's "today" (UTC) so the date check agrees with src/lib/validation/position.ts.
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function checkDecimal(raw: string, required: boolean, requiredMessage: string): string | undefined {
  if (!raw.trim()) return required ? requiredMessage : undefined;
  const value = parseDecimal(raw);
  if (value === null) return "Enter a number like 50.25";
  if (value === "0") return "Must be greater than 0";
  return undefined;
}

function noopSubscribe() {
  return () => undefined;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
      <CircleAlert className="size-3" />
      {message}
    </p>
  );
}

export default function PositionForm({
  categories,
  wallets,
  values: initialValues,
  errors: initialErrors,
  earlierPositions,
  listingChoices: initialChoices = [],
  selectedListing: initialSelection = null,
  listingSearched = false,
}: Props) {
  const [values, setValues] = useState<PositionFormValues>(initialValues);
  const [errors, setErrors] = useState<PositionFormErrors>(initialErrors);
  const [listingChoices, setListingChoices] = useState(initialChoices);
  const [selectedListing, setSelectedListing] = useState(initialSelection);
  const [searched, setSearched] = useState(listingSearched);
  // In-place search (hydrated only): the native search/select POSTs remain the no-JS path.
  const [searching, setSearching] = useState(false);
  const [announcement, setAnnouncement] = useState<{ text: string; visuallyHidden: boolean } | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  const focusChangeButton = useRef(false);
  const categorySelect = useRef<HTMLSelectElement>(null);
  const [categoryChoice, setCategoryChoice] = useState(() => {
    if (initialValues.category_id) return initialValues.category_id;
    if (initialValues.new_category_name || categories.length === 0) return NEW_CATEGORY;
    return "";
  });
  const isNewCategory = categoryChoice === NEW_CATEGORY;
  // Server-rendered HTML always carries the name input, so "New category…" works without JS;
  // once hydrated, it is shown only for that choice.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  useEffect(
    () => () => {
      searchAbort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (focusChangeButton.current && selectedListing) {
      focusChangeButton.current = false;
      changeButton.current?.focus();
    }
  }, [selectedListing]);

  function cancelSearch() {
    searchAbort.current?.abort();
    searchAbort.current = null;
    setSearching(false);
  }

  /** Mirrors the native `search_listing` POST: a new search drops any earlier selection. */
  async function runSearch() {
    cancelSearch();
    setSelectedListing(null);
    setListingChoices([]);
    setSearched(false);
    setValues((previous) => ({ ...previous, listing_receipt_id: "", instrument: "" }));
    setErrors((previous) => ({
      ...previous,
      wallet_id: undefined,
      listing_query: undefined,
      listing_receipt_id: undefined,
      instrument: undefined,
      form: undefined,
    }));
    const query = values.listing_query.trim();
    if (!values.wallet_id || query.length < 2 || query.length > 100) {
      setErrors((previous) => ({ ...previous, listing_query: STOCK_SEARCH_COPY.invalidRequest }));
      setAnnouncement({ text: STOCK_SEARCH_COPY.invalidRequest, visuallyHidden: true });
      return;
    }
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setAnnouncement(null);
    const outcome = await searchStockListings(values.wallet_id, query, controller.signal);
    // A newer search, a wallet change or unmount superseded this one.
    if (searchAbort.current !== controller) return;
    searchAbort.current = null;
    setSearching(false);
    if (outcome.ok) {
      setListingChoices(outcome.choices);
      setSearched(true);
      const count = outcome.choices.length;
      setAnnouncement(
        count === 0
          ? null
          : {
              text: `${String(count)} ${count === 1 ? "listing" : "listings"} found. Select one below.`,
              visuallyHidden: false,
            },
      );
    } else if ("errors" in outcome) {
      setErrors((previous) => ({ ...previous, ...outcome.errors }));
      const message = outcome.errors.wallet_id ?? outcome.errors.listing_query;
      setAnnouncement(message ? { text: message, visuallyHidden: true } : null);
    }
  }

  function selectChoice(choice: MarketSelectionChoice) {
    setSelectedListing(choice);
    setValues((previous) => ({ ...previous, listing_receipt_id: choice.receiptId, instrument: choice.symbol }));
    setErrors((previous) => ({ ...previous, listing_receipt_id: undefined, instrument: undefined, form: undefined }));
    setListingChoices([]);
    setSearched(false);
    setAnnouncement(null);
    focusChangeButton.current = true;
  }

  function changeSelection() {
    setSelectedListing(null);
    setValues((previous) => ({ ...previous, listing_receipt_id: "", instrument: "" }));
    setAnnouncement({ text: "Selection cleared. Search for the listing again.", visuallyHidden: false });
    document.getElementById("listing_query")?.focus();
  }

  function update(field: PositionFormField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field] || errors.form) setErrors((prev) => ({ ...prev, [field]: undefined, form: undefined }));
  }

  function validate() {
    const next: PositionFormErrors = {};
    if (!values.listing_receipt_id || !selectedListing) next.listing_receipt_id = "Search and select a stock listing";

    next.buy_price = checkDecimal(values.buy_price, true, "Enter the buy price");
    next.quantity = checkDecimal(values.quantity, false, "");

    if (!values.buy_date) next.buy_date = "Enter the buy date";
    else if (values.buy_date > todayUtc()) next.buy_date = "The buy date cannot be in the future";

    if (!values.wallet_id) next.wallet_id = "Choose a wallet";

    if (isNewCategory) {
      const name = values.new_category_name.trim();
      if (!name) next.new_category_name = "Name the new category";
      else if (name.length > 60) next.new_category_name = "Use at most 60 characters";
    } else if (!categoryChoice) {
      next.category_id = "Choose a category";
    }

    if (values.reason_text.length > 10_000) next.reason_text = "Use at most 10,000 characters";
    if (values.broker_label.trim().length > 60) next.broker_label = "Use at most 60 characters";

    setErrors(next);
    return Object.values(next).every((message) => !message);
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const submitter = e.nativeEvent.submitter;
    if (
      submitter instanceof HTMLButtonElement &&
      (submitter.name === "select_listing" || submitter.value === "search_listing")
    )
      return;
    if (!validate()) {
      e.preventDefault();
    }
  }

  const categoryError = errors.category_id;
  const selectedWallet = wallets.find((wallet) => wallet.id === values.wallet_id);
  // Derived from state, not gated on `hydrated`: the no-JS re-render must show the same panel.
  const confrontation = confrontationState(categoryChoice, values.new_category_name, categories, earlierPositions);

  return (
    <form method="POST" action="/dashboard/new" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="wallet" className="mb-1 block text-sm text-blue-100/80">
          Wallet
        </label>
        {wallets.length === 0 ? (
          <p className="text-sm text-blue-100/80">
            You have no wallets yet.{" "}
            <a href="/dashboard/wallets/new" className="text-purple-300 hover:underline">
              Create a wallet
            </a>{" "}
            first.
          </p>
        ) : (
          <select
            id="wallet"
            name="wallet_id"
            value={values.wallet_id}
            onChange={(e) => {
              const walletId = e.target.value;
              setValues((previous) => ({ ...previous, wallet_id: walletId, listing_receipt_id: "", instrument: "" }));
              setErrors((previous) => ({
                ...previous,
                wallet_id: undefined,
                listing_receipt_id: undefined,
                instrument: undefined,
                form: undefined,
              }));
              // Receipts are wallet-bound, so a selection or results from another wallet cannot be kept.
              cancelSearch();
              setAnnouncement(
                selectedListing || listingChoices.length > 0
                  ? {
                      text: "The wallet changed, so the stock selection was cleared. Search and select the listing again.",
                      visuallyHidden: false,
                    }
                  : null,
              );
              setSelectedListing(null);
              setListingChoices([]);
              setSearched(false);
            }}
            aria-invalid={errors.wallet_id ? true : undefined}
            className={cn(
              controlBase,
              "[&>option]:bg-popover [&>option]:text-popover-foreground",
              errors.wallet_id ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
            )}
          >
            <option value="" disabled>
              Choose a wallet…
            </option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id} data-wallet-id={wallet.id}>
                {wallet.name}
              </option>
            ))}
          </select>
        )}
        <FieldError message={errors.wallet_id} />
      </div>

      <fieldset
        className="space-y-3 rounded-lg border border-white/20 p-3"
        onKeyDown={(e) => {
          // Enter in the query searches in place instead of submitting the whole form.
          if (
            e.key === "Enter" &&
            !e.nativeEvent.isComposing &&
            e.target instanceof HTMLInputElement &&
            e.target.id === "listing_query"
          ) {
            e.preventDefault();
            void runSearch();
          }
        }}
      >
        <legend className="px-1 text-sm font-medium">Stock listing</legend>
        <FormField
          id="listing_query"
          label="Company or symbol"
          value={values.listing_query}
          onChange={(value) => {
            update("listing_query", value);
          }}
          placeholder="e.g. Apple or PKN.WA"
          error={errors.listing_query}
          icon={<Search className="size-4" />}
          autoFocus
        />
        <button
          type="submit"
          name="action"
          value="search_listing"
          formNoValidate
          onClick={(e) => {
            e.preventDefault();
            void runSearch();
          }}
          className="rounded-lg border border-white/30 px-3 py-2 text-sm hover:bg-white/10"
        >
          Search listings
        </button>
        <p aria-live="polite" className="text-sm text-blue-100/70">
          {searching ? (
            "Searching listings…"
          ) : announcement ? (
            <span className={cn(announcement.visuallyHidden && "sr-only")}>{announcement.text}</span>
          ) : null}
        </p>
        {listingChoices.length > 0 && (
          <ul className="space-y-2" aria-label="Stock search results">
            {listingChoices.map((choice) => (
              <li key={choice.receiptId} className="rounded-lg border border-white/15 p-2 text-sm">
                <p className="font-medium">
                  {choice.name} · {choice.symbol}
                </p>
                <p className="text-blue-100/70">
                  {choice.exchangeName} ({choice.exchange}) · {choice.instrumentType}
                </p>
                <button
                  type="submit"
                  name="select_listing"
                  value={choice.receiptId}
                  formNoValidate
                  onClick={(e) => {
                    e.preventDefault();
                    selectChoice(choice);
                  }}
                  className="mt-2 text-purple-300 underline underline-offset-4"
                >
                  Select {choice.symbol}
                </button>
              </li>
            ))}
          </ul>
        )}
        {searched && listingChoices.length === 0 && !errors.listing_query && (
          <p className="text-sm text-blue-100/70">No matching listings. Try another company name or symbol.</p>
        )}
        <input type="hidden" name="listing_receipt_id" value={values.listing_receipt_id} />
        <input type="hidden" name="instrument" value={values.instrument} />
        {selectedListing ? (
          <div className="flex items-start justify-between gap-3 rounded-lg bg-white/10 p-2 text-sm">
            <div role="status">
              <p className="font-medium">
                Selected: {selectedListing.name} · {selectedListing.symbol}
              </p>
              <p>
                {selectedListing.exchangeName} ({selectedListing.exchange}) · {selectedListing.instrumentType}
              </p>
            </div>
            {hydrated && (
              <button
                ref={changeButton}
                type="button"
                onClick={changeSelection}
                className="shrink-0 text-purple-300 underline underline-offset-4 hover:text-purple-200 focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                Change
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-blue-100/70">Search and select the exchange listing before saving.</p>
        )}
        <FieldError message={errors.listing_receipt_id ?? errors.instrument} />
        <p className="text-xs text-blue-100/70">
          {selectedWallet ? `Wallet currency: ${selectedWallet.currency}. ` : "Choose a wallet first. "}
          Search, selection and saving do not download prices. Trading currency is checked when you first click Download
          prices on the dashboard.
        </p>
      </fieldset>

      <FormField
        id="buy_price"
        label="Buy price (per share)"
        value={values.buy_price}
        onChange={(v) => {
          update("buy_price", v);
        }}
        placeholder="50.25"
        error={errors.buy_price}
        icon={<Wallet className="size-4" />}
        inputMode="decimal"
      />

      <FormField
        id="buy_date"
        label="Buy date"
        type="date"
        value={values.buy_date}
        onChange={(v) => {
          update("buy_date", v);
        }}
        error={errors.buy_date}
        icon={<Calendar className="size-4" />}
        max={todayUtc()}
      />

      <div>
        <label htmlFor="category" className="mb-1 block text-sm text-blue-100/80">
          Reason category
        </label>
        {/* "New category…" posts the sentinel; the server then reads new_category_name instead. */}
        <select
          ref={categorySelect}
          id="category"
          name="category_id"
          value={categoryChoice}
          onChange={(e) => {
            setCategoryChoice(e.target.value);
            if (e.target.value !== NEW_CATEGORY) update("new_category_name", "");
            setErrors((prev) => ({ ...prev, category_id: undefined, new_category_name: undefined, form: undefined }));
          }}
          aria-invalid={categoryError ? true : undefined}
          className={cn(
            controlBase,
            "[&>option]:bg-popover [&>option]:text-popover-foreground",
            categoryError ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        >
          {categories.length > 0 && <option value="">Choose a category…</option>}
          {categories.map((category) => (
            <option key={category.id} value={category.id} data-category-id={category.id}>
              {category.name}
            </option>
          ))}
          <option value={NEW_CATEGORY}>New category…</option>
        </select>
        <FieldError message={categoryError} />
      </div>

      {(isNewCategory || !hydrated) && (
        <div>
          <FormField
            id="new_category_name"
            label={isNewCategory ? "New category name" : "New category name (only with “New category…”)"}
            value={values.new_category_name}
            onChange={(v) => {
              update("new_category_name", v);
            }}
            placeholder="e.g. Dividend growth"
            error={errors.new_category_name}
            icon={<Tag className="size-4" />}
          />
          {hydrated && isNewCategory && categories.length > 0 && (
            <button
              type="button"
              className="mt-2 text-sm text-purple-300 underline underline-offset-4 hover:text-purple-200 focus-visible:outline-2 focus-visible:outline-offset-4"
              onClick={() => {
                setCategoryChoice("");
                update("new_category_name", "");
                setErrors((prev) => ({
                  ...prev,
                  category_id: undefined,
                  new_category_name: undefined,
                  form: undefined,
                }));
                categorySelect.current?.focus();
              }}
            >
              Cancel new category
            </button>
          )}
        </div>
      )}

      <ConfrontationPanel state={confrontation} />

      <div>
        <label htmlFor="reason_text" className="mb-1 block text-sm text-blue-100/80">
          Reason <span className="text-blue-100/50">(optional)</span>
        </label>
        <textarea
          id="reason_text"
          name="reason_text"
          rows={4}
          value={values.reason_text}
          onChange={(e) => {
            update("reason_text", e.target.value);
          }}
          placeholder="Why are you buying this?"
          aria-invalid={errors.reason_text ? true : undefined}
          className={cn(
            controlBase,
            errors.reason_text ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        />
        <FieldError message={errors.reason_text} />
      </div>

      <FormField
        id="quantity"
        label="Quantity (optional)"
        value={values.quantity}
        onChange={(v) => {
          update("quantity", v);
        }}
        placeholder="10"
        error={errors.quantity}
        icon={<Hash className="size-4" />}
        inputMode="decimal"
      />

      <FormField
        id="broker_label"
        label="Broker (optional)"
        value={values.broker_label}
        onChange={(v) => {
          update("broker_label", v);
        }}
        placeholder="e.g. XTB"
        error={errors.broker_label}
        icon={<Briefcase className="size-4" />}
      />

      <ServerError message={errors.form} />

      <SubmitButton name="action" value="save" pendingText="Saving..." icon={<Save className="size-4" />}>
        Save investment
      </SubmitButton>
    </form>
  );
}
