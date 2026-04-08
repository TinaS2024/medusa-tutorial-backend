import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types";
import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { useState } from "react";

const ProductOptionMetadataWidget = ({ data }: DetailWidgetProps<AdminProduct>) => {
  const product = data;
  const [optionKeys, setOptionKeys] = useState<Record<string, string>>(
    ((product.metadata as any)?.option_keys as Record<string, string> | undefined) ?? {}
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (optionId: string, value: string) => {
    setOptionKeys((prev) => ({
      ...prev,
      [optionId]: value,
    }));
    setSuccess(false);
    setError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/admin/products/${product.id}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metadata: {
            ...(product.metadata || {}),
            option_keys: optionKeys,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      setSuccess(true);
    } catch (e: any) {
      setError(e?.message ?? "Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  };

  if (!product.options || product.options.length === 0) {
    return null;
  }

  return (
     <div style={{ padding: 16, borderTop: "1px solid #e5e5e5", marginTop: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Optionen Metadaten</h2>
      <p style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
        Pro Produktoption kannst du hier einen technischen Namen hinterlegen. Diese Namen
        werden im Storefront verwendet, unabhängig vom sichtbaren UI-Titel.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {product.options.map((option) => {
          const value = optionKeys[option.id] ?? "";
          return (
            <div key={option.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#666" }}>UI Name: {option.title}</span>
              <input
                type="text"
                placeholder="z.B. cushion_color"
                value={value}
                onChange={(e) => handleChange(option.id, e.target.value)}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 4,
                  padding: "6px 8px",
                  fontSize: 13,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={`metadata-save-btn ${isSaving ? "metadata-saving" : ""}`}
        >
          {isSaving ? "Speichern..." : "Metadaten speichern"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          style={{padding: "6px 12px",borderRadius: 4,border: "none",backgroundColor: isSaving ? "#9ca3af" : "#111827",
            color: "white",
            fontSize: 13,
            cursor: isSaving ? "default" : "pointer",
          }}>
          {isSaving ? "Speichern..." : "Metadaten speichern"}
        </button>

        {success && (
          <span style={{ fontSize: 12, color: "#059669" }}>Metadaten gespeichert.</span>
        )}
        {error && (
          <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>
        )}
      </div>
      </div>
  );
};

export const config = defineWidgetConfig({
  zone: "product.details.after",
});

export default ProductOptionMetadataWidget;
