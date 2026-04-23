"use client";

/**
 * IconPicker — searchable grid of icons for selecting dock button icons.
 *
 * Displays curated Lucide icons + market icons from @markets/icons-svg.
 * Uses DynamicIcon from @markets/icons-svg/react for rendering.
 */

import { useState, useMemo } from "react";
import { DynamicIcon as Icon } from "@markets/icons-svg/react";
import { MARKET_ICON_SVGS, svgToDataUrl } from "@markets/icons-svg/all-icons";
import { ICON_META, type MarketIconName } from "@markets/icons-svg";
import { ICON_OPTIONS } from "./dock-editor/icons";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "../lib/utils";

// ─── Types ───────────────────────────────────────────────────────────

interface IconPickerProps {
  onSelect: (iconName: string, svgDataUrl: string) => void;
  selectedIcon?: string;
  /** Color for the SVG data URL (default "#ffffff" for dark theme) */
  color?: string;
}

interface IconEntry {
  id: string;
  name: string;
  source: "lucide" | "market";
}

// ─── Build the full icon list ────────────────────────────────────────

function buildIconList(): IconEntry[] {
  const icons: IconEntry[] = [];

  // Market icons from the single source of truth
  for (const [key, meta] of Object.entries(ICON_META)) {
    // Skip system icons (wrench, code, etc.) — those aren't user-selectable
    if (meta.category === "system") continue;
    icons.push({
      id: `mkt:${key}`,
      name: meta.name,
      source: "market",
    });
  }

  // Lucide icons from the curated list
  for (const opt of ICON_OPTIONS) {
    icons.push({
      id: opt.icon,
      name: opt.name,
      source: "lucide",
    });
  }

  return icons;
}

const ALL_ICONS = buildIconList();

// ─── Component ──────────────────────────────────────────────────────

export function IconPicker({ onSelect, selectedIcon, color = "#ffffff" }: IconPickerProps) {
  const [search, setSearch] = useState("");

  // Filter icons based on search query
  const filteredIcons = useMemo(() => {
    if (!search.trim()) return ALL_ICONS;
    const query = search.toLowerCase();
    return ALL_ICONS.filter((icon) => icon.name.toLowerCase().includes(query));
  }, [search]);

  function handleSelect(icon: IconEntry) {
    if (icon.source === "market") {
      const key = icon.id.replace("mkt:", "");
      const svg = MARKET_ICON_SVGS[key];
      if (svg) {
        onSelect(icon.name, svgToDataUrl(svg, color));
      }
    } else {
      // Lucide icons — build an Iconify CDN URL
      const [prefix, name] = icon.id.split(":");
      if (prefix && name) {
        const url = `https://api.iconify.design/${prefix}/${name}.svg?color=${encodeURIComponent(color)}&height=24`;
        onSelect(icon.name, url);
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Search */}
      <div className="relative">
        <Icon icon="lucide:search" style={{ width: 14, height: 14, color: "var(--de-text-tertiary)" }} />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons…"
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* Icon grid */}
      <ScrollArea className="h-48">
        <div className="grid grid-cols-8 gap-1 p-1">
          {filteredIcons.length === 0 && (
            <div className="col-span-8 text-center text-xs text-muted-foreground py-4">
              No icons found
            </div>
          )}
          {filteredIcons.map((icon) => (
            <button
              key={icon.id}
              type="button"
              title={icon.name}
              onClick={() => handleSelect(icon)}
              className={cn(
                "w-8 h-8 flex items-center justify-center rounded border cursor-pointer",
                "hover:bg-accent hover:border-accent transition-colors",
                selectedIcon === icon.name && "bg-accent border-primary",
              )}
              style={{ background: "var(--de-bg-surface, var(--card))", borderColor: "var(--de-border, var(--border))" }}
            >
              {icon.source === "market" ? (
                <span
                  className="text-foreground"
                  style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}
                  dangerouslySetInnerHTML={{
                    __html: MARKET_ICON_SVGS[icon.id.replace("mkt:", "")]
                      ?.replace(/width="24"/g, 'width="16"')
                      .replace(/height="24"/g, 'height="16"') ?? "",
                  }}
                />
              ) : (
                <Icon icon={icon.id} style={{ width: 16, height: 16, color: "var(--de-text-secondary, var(--muted-foreground))" }} />
              )}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
