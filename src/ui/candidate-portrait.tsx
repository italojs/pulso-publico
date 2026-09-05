"use client";

import { useState } from "react";

export function CandidatePortrait({
  ballotName,
  photoUrl,
}: Readonly<{ ballotName: string; photoUrl: string | null }>) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <img
        alt={`Foto oficial de ${ballotName}`}
        onError={() => setFailed(true)}
        src={photoUrl}
      />
    );
  }
  return (
    <div aria-label={`Foto oficial não disponibilizada para ${ballotName}`} role="img">
      <span aria-hidden="true">◇</span>
      <small>Foto oficial ainda não disponibilizada pelo TSE</small>
    </div>
  );
}
