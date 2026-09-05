// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import RegisterPage from "../../app/cadastro/page.tsx";
import LoginPage from "../../app/entrar/page.tsx";

afterEach(cleanup);

describe("candidate authentication copy", () => {
  it.each([
    ["login", LoginPage],
    ["registration", RegisterPage],
  ])("mentions candidatures on the %s page", async (_name, Page) => {
    render(await Page({ searchParams: Promise.resolve({
      next: "/candidatos/2026/260001234567",
    }) }));

    expect(screen.getByText(/projetos, parlamentares e candidaturas/i)).toBeInTheDocument();
  });
});
