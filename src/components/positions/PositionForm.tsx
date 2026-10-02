import React, { useState, useSyncExternalStore } from "react";
import { Briefcase, Calendar, CircleAlert, Hash, Save, Tag, TrendingUp, Wallet } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { parseDecimal } from "@/lib/validation/decimal";
import { cn } from "@/lib/utils";
import {
  NEW_CATEGORY_CHOICE as NEW_CATEGORY,
  type PositionFormErrors,
  type PositionFormField,
  type PositionFormValues,
  type ReasonCategory,
} from "@/types";

const controlBase =
  "w-full rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none";

interface Props {
  categories: ReasonCategory[];
  values: PositionFormValues;
  errors: PositionFormErrors;
}

// Mirrors the server's "today" (UTC) so the date check agrees with src/lib/validation/position.ts.
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function checkDecimal(raw: string, required: boolean, requiredMessage: string): string | undefined {
  if (!raw.trim()) return required ? requiredMessage : undefined;
  const value = parseDecimal(raw);
  if (value === null) return "Enter a number like 50.25";
  if (value <= 0) return "Must be greater than 0";
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

export default function PositionForm({ categories, values: initialValues, errors: initialErrors }: Props) {
  const [values, setValues] = useState<PositionFormValues>(initialValues);
  const [errors, setErrors] = useState<PositionFormErrors>(initialErrors);
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

  function update(field: PositionFormField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field] || errors.form) setErrors((prev) => ({ ...prev, [field]: undefined, form: undefined }));
  }

  function validate() {
    const next: PositionFormErrors = {};
    const instrument = values.instrument.trim();
    if (!instrument) next.instrument = "Enter the instrument";
    else if (instrument.length > 100) next.instrument = "Use at most 100 characters";

    next.buy_price = checkDecimal(values.buy_price, true, "Enter the buy price");
    next.quantity = checkDecimal(values.quantity, false, "");

    if (!values.buy_date) next.buy_date = "Enter the buy date";
    else if (values.buy_date > todayUtc()) next.buy_date = "The buy date cannot be in the future";

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
    if (!validate()) {
      e.preventDefault();
    }
  }

  const categoryError = errors.category_id;

  return (
    <form method="POST" action="/dashboard/new" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="instrument"
        label="Instrument"
        value={values.instrument}
        onChange={(v) => {
          update("instrument", v);
        }}
        placeholder="e.g. VWCE or Apple"
        error={errors.instrument}
        icon={<TrendingUp className="size-4" />}
        autoFocus
      />

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
          id="category"
          name="category_id"
          value={categoryChoice}
          onChange={(e) => {
            setCategoryChoice(e.target.value);
            setErrors((prev) => ({ ...prev, category_id: undefined, new_category_name: undefined, form: undefined }));
          }}
          aria-invalid={categoryError ? true : undefined}
          className={cn(
            controlBase,
            "[&>option]:text-black",
            categoryError ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        >
          {categories.length > 0 && (
            <option value="" disabled>
              Choose a category…
            </option>
          )}
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
      )}

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

      <SubmitButton pendingText="Saving..." icon={<Save className="size-4" />}>
        Save investment
      </SubmitButton>
    </form>
  );
}
