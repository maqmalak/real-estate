import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Link into the Frappe desk (proxied through this app, same session). */
export function deskUrl(path: string): string {
  return `/desk/${path.replace(/^\//, "")}`;
}

export function slug(doctype: string): string {
  return doctype.toLowerCase().replace(/ /g, "-");
}
