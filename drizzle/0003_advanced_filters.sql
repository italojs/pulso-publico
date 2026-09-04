CREATE TYPE "public"."simplified_stage" AS ENUM('presented', 'committees', 'ready_for_vote', 'voted', 'sanction_or_veto', 'closed', 'unclassified');--> statement-breakpoint
CREATE TYPE "public"."vote_result_category" AS ENUM('approved', 'rejected', 'other', 'unavailable');--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "proposal_type" text;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "proposal_number" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "proposal_year" integer;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "simplified_stage" "simplified_stage" DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "vote_events" ADD COLUMN "result_category" "vote_result_category" DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
UPDATE "bills"
SET ("proposal_type", "proposal_number", "proposal_year") = (
  SELECT upper(identity[1]), identity[2]::integer, identity[3]::integer
  FROM regexp_match(
    "official_code",
    '^([[:alpha:]]{2,10})[[:space:]]+([0-9]{1,9})[[:space:]]*/[[:space:]]*([0-9]{4})'
  ) AS identity
)
WHERE "official_code" ~ '^([[:alpha:]]{2,10})[[:space:]]+([0-9]{1,9})[[:space:]]*/[[:space:]]*([0-9]{4})';--> statement-breakpoint
UPDATE "bills"
SET "simplified_stage" = CASE
  WHEN lower("status_label") LIKE '%transformada em norma jurídica%'
    OR lower("status_label") LIKE '%transformado em norma jurídica%'
    OR lower("status_label") LIKE '%transformada em norma juridica%'
    OR lower("status_label") LIKE '%transformado em norma juridica%'
    OR lower("status_label") LIKE '%arquivada%'
    OR lower("status_label") LIKE '%arquivado%'
    OR lower("status_label") LIKE '%encerrada%'
    OR lower("status_label") LIKE '%encerrado%'
    OR lower("status_label") LIKE '%prejudicada%'
    OR lower("status_label") LIKE '%prejudicado%'
    THEN 'closed'::"simplified_stage"
  WHEN lower("status_label") LIKE '%encaminhada a sanção%'
    OR lower("status_label") LIKE '%encaminhado a sanção%'
    OR lower("status_label") LIKE '%encaminhada a sancao%'
    OR lower("status_label") LIKE '%encaminhado a sancao%'
    OR lower("status_label") LIKE '%aguardando sanção%'
    OR lower("status_label") LIKE '%aguardando sancao%'
    OR lower("status_label") LIKE '%sancionada%'
    OR lower("status_label") LIKE '%sancionado%'
    OR lower("status_label") LIKE '%vetada%'
    OR lower("status_label") LIKE '%vetado%'
    OR lower("status_label") LIKE '%veto%'
    THEN 'sanction_or_veto'::"simplified_stage"
  WHEN lower("status_label") LIKE '%pronta para pauta%'
    OR lower("status_label") LIKE '%pronto para pauta%'
    OR lower("status_label") LIKE '%pronta para votação%'
    OR lower("status_label") LIKE '%pronto para votação%'
    OR lower("status_label") LIKE '%pronta para votacao%'
    OR lower("status_label") LIKE '%pronto para votacao%'
    OR lower("status_label") LIKE '%incluída na pauta%'
    OR lower("status_label") LIKE '%incluido na pauta%'
    OR lower("status_label") LIKE '%incluida na pauta%'
    OR lower("status_label") LIKE '%ordem do dia%'
    OR lower("status_label") LIKE '%aguardando votação%'
    OR lower("status_label") LIKE '%aguardando votacao%'
    THEN 'ready_for_vote'::"simplified_stage"
  WHEN lower("status_label") LIKE '%votação concluída%'
    OR lower("status_label") LIKE '%votação realizada%'
    OR lower("status_label") LIKE '%votacao concluida%'
    OR lower("status_label") LIKE '%votacao realizada%'
    OR lower("status_label") LIKE '%matéria votada%'
    OR lower("status_label") LIKE '%materia votada%'
    OR lower("status_label") LIKE '%projeto votado%'
    OR lower("status_label") LIKE '%aprovada%'
    OR lower("status_label") LIKE '%aprovado%'
    OR lower("status_label") LIKE '%rejeitada%'
    OR lower("status_label") LIKE '%rejeitado%'
    OR lower("status_label") LIKE '%votada%'
    OR lower("status_label") LIKE '%votado%'
    OR lower("status_label") LIKE '%deliberada%'
    OR lower("status_label") LIKE '%deliberado%'
    THEN 'voted'::"simplified_stage"
  WHEN lower("status_label") LIKE '%comissão%'
    OR lower("status_label") LIKE '%comissao%'
    OR lower("status_label") LIKE '%comissões%'
    OR lower("status_label") LIKE '%comissoes%'
    OR lower("status_label") LIKE '%parecer%'
    OR lower("status_label") LIKE '%relator%'
    OR lower("status_label") LIKE '%relatoria%'
    THEN 'committees'::"simplified_stage"
  WHEN lower("status_label") LIKE '%apresentada%'
    OR lower("status_label") LIKE '%apresentado%'
    OR lower("status_label") LIKE '%apresentação%'
    OR lower("status_label") LIKE '%apresentacao%'
    OR lower("status_label") LIKE '%recebida%'
    OR lower("status_label") LIKE '%recebido%'
    OR lower("status_label") LIKE '%protocolada%'
    OR lower("status_label") LIKE '%protocolado%'
    THEN 'presented'::"simplified_stage"
  ELSE 'unclassified'::"simplified_stage"
END;--> statement-breakpoint
UPDATE "vote_events"
SET "result_category" = CASE
  WHEN "result" IS NULL OR btrim("result") = '' THEN 'unavailable'::"vote_result_category"
  WHEN lower("result") ~ '(^|[^[:alnum:]_])(não|nao)[[:space:]]+((foi|foram)[[:space:]]+)?(aprovad[oa]s?|rejeitad[oa]s?)($|[^[:alnum:]_])'
    OR (
      (lower("result") LIKE '%aprovado%' OR lower("result") LIKE '%aprovada%')
      AND (lower("result") LIKE '%rejeitado%' OR lower("result") LIKE '%rejeitada%')
    ) THEN 'other'::"vote_result_category"
  WHEN lower("result") LIKE '%aprovado%' OR lower("result") LIKE '%aprovada%'
    THEN 'approved'::"vote_result_category"
  WHEN lower("result") LIKE '%rejeitado%' OR lower("result") LIKE '%rejeitada%'
    THEN 'rejected'::"vote_result_category"
  ELSE 'other'::"vote_result_category"
END;--> statement-breakpoint
CREATE INDEX "bills_proposal_type_year_idx" ON "bills" USING btree ("proposal_type","proposal_year");--> statement-breakpoint
CREATE INDEX "bills_simplified_stage_idx" ON "bills" USING btree ("simplified_stage");--> statement-breakpoint
CREATE INDEX "bills_houses_idx" ON "bills" USING btree ("origin_house","current_house");--> statement-breakpoint
CREATE INDEX "vote_events_result_category_idx" ON "vote_events" USING btree ("result_category");
