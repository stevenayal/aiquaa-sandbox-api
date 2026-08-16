"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";

export default function DocsPage() {
  return (
    <ApiReferenceReact
      configuration={{
        url: "/api/v1/docs",
      }}
    />
  );
}
