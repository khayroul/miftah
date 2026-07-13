"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { maybeHandleOfflineDocumentNavigation } from "@/shared/pwa/navigation";

type OfflineAwareLinkProps = ComponentProps<typeof Link>;

export function OfflineAwareLink({
  href,
  onClick,
  ...props
}: OfflineAwareLinkProps) {
  return (
    <Link
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }

        if (typeof href === "string") {
          maybeHandleOfflineDocumentNavigation(event, href);
        }
      }}
      {...props}
    />
  );
}
