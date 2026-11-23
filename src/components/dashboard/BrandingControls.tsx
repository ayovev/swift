import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePickerButton } from "./FilePickerButton";
import { clearBrand, MAX_NAME_LENGTH, updateBrand, useBrand } from "@/lib/brand/brandStore";
import { BRAND_ACCENT_ID, brandSwatch } from "@/lib/brand/color";
import { LogoError, normaliseLogo } from "@/lib/brand/image";
import { capture } from "@/lib/posthog";
import { useTheme } from "@/lib/theme/useTheme";

const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";
/** Shown in the colour input before one is chosen. Not stored. */
const PLACEHOLDER_COLOR = "#2563eb";

const saved = (): void => capture({ name: "interaction_used", props: { interaction: "brand_saved" } });

/**
 * The Branding section of Settings (coaches only; the caller decides). Logo,
 * gym name and brand colour, each optional, all kept on this device.
 */
export function BrandingControls() {
  const brand = useBrand();
  const { accent, setAccent } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasBrand = Boolean(brand.logo || brand.name || brand.color);
  const swatch = brand.color ? brandSwatch(brand.color) : null;

  const onLogo = async (file: File): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const { dataUrl, tone } = await normaliseLogo(file);
      updateBrand({ logo: dataUrl, tone });
      saved();
    } catch (e) {
      setError(e instanceof LogoError ? e.message : "That image couldn't be read. Try exporting it again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {brand.logo ? (
            <img src={brand.logo} alt="" className="h-8 max-w-24 rounded-sm border border-border bg-muted object-contain p-0.5" />
          ) : null}
          <span className="text-sm">Logo</span>
        </div>
        <div className="flex gap-2">
          <FilePickerButton
            onFile={(f) => void onLogo(f)}
            accept={LOGO_ACCEPT}
            ariaLabel={brand.logo ? "Replace logo" : "Add logo"}
            disabled={busy}
            className="h-8"
          >
            {brand.logo ? "Replace" : "Add logo"}
          </FilePickerButton>
          {brand.logo ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              aria-label="Remove logo"
              onClick={() => {
                updateBrand({ logo: undefined });
                saved();
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground">PNG, JPEG or WebP, up to 5 MB. SVG isn't accepted.</p>
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brand-name" className="text-sm font-normal">
          Gym name
        </Label>
        <Input
          id="brand-name"
          key={brand.name ?? ""}
          defaultValue={brand.name ?? ""}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="off"
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== (brand.name ?? "")) {
              updateBrand({ name: next === "" ? undefined : next });
              saved();
            }
          }}
        />
        <p className="text-[13px] text-muted-foreground">Read aloud as the logo's description.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label htmlFor="brand-color" className="text-sm font-normal">
          Brand colour
        </Label>
        <div className="flex items-center gap-2">
          {brand.color ? <span className="font-mono text-xs text-muted-foreground">{brand.color}</span> : null}
          <input
            id="brand-color"
            type="color"
            value={brand.color ?? PLACEHOLDER_COLOR}
            onChange={(e) => {
              updateBrand({ color: e.target.value.toLowerCase() });
              setAccent(BRAND_ACCENT_ID);
            }}
            onBlur={() => {
              if (brand.color) saved();
            }}
            className="h-8 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
          />
          {brand.color ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              aria-label="Clear brand colour"
              onClick={() => {
                updateBrand({ color: undefined });
                saved();
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
      {swatch?.adjusted ? (
        <p className="text-[13px] text-muted-foreground">
          Adjusted slightly so text and buttons stay readable in both modes.
        </p>
      ) : null}
      {brand.color && accent !== BRAND_ACCENT_ID ? (
        <div>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setAccent(BRAND_ACCENT_ID)}>
            Use brand colour
          </Button>
        </div>
      ) : null}

      <p className="text-[13px] text-muted-foreground">
        Branding stays on this device. It isn't uploaded, synced or included in a backup, and Start over doesn't remove
        it. Swift's own mark always stays beside yours.
      </p>

      {hasBrand ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 self-start">
              Remove branding
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove branding?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes your logo, gym name and brand colour from this device. Your data and the dashboard stay as
                they are.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  clearBrand();
                  capture({ name: "interaction_used", props: { interaction: "brand_removed" } });
                }}
                className={buttonVariants({ size: "sm" })}
              >
                Remove branding
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
