import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Socket } from "socket.io-client";
import AccountSettingsModal from "./AccountSettingsModal";
import { expectNoAxeViolations } from "@/test/axe";

const rpc = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc,
    from: () => ({ select: () => ({ maybeSingle }) }),
  }),
}));

function fakeSocket(response: { ok: boolean; message?: string } = { ok: true }) {
  const emit = vi.fn((_event, _payload, callback) => callback(null, response));
  return {
    connected: true,
    timeout: vi.fn(() => ({ emit })),
    emit,
  };
}

function open({
  response,
  socket = fakeSocket(response),
}: {
  response?: { ok: boolean; message?: string };
  socket?: ReturnType<typeof fakeSocket> | null;
} = {}) {
  const onDeleted = vi.fn().mockResolvedValue(undefined);
  render(
    <AccountSettingsModal
      onClose={vi.fn()}
      onDeleted={onDeleted}
      socketRef={{ current: socket as unknown as Socket | null }}
    />,
  );
  return { onDeleted, socket };
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: {}, error: null });
  maybeSingle.mockReset().mockResolvedValue({
    data: { marketing_opt_in: true },
    error: null,
  });
});

describe("AccountSettingsModal", () => {
  it("has no detectable semantic accessibility violations", async () => {
    const { container } = render(
      <AccountSettingsModal
        onClose={vi.fn()}
        onDeleted={vi.fn()}
        socketRef={{ current: fakeSocket() as unknown as Socket }}
      />,
    );
    await screen.findByRole("checkbox");
    await expectNoAxeViolations(container);
  });

  it("links to inspectable Terms and Privacy documents", async () => {
    open();
    expect(await screen.findByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });

  it("withdraws marketing consent without removing companion access", async () => {
    open();
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("claim_premium", {
        p_marketing_opt_in: false,
      }),
    );
    expect(await screen.findByText("Marketing email off.")).toBeInTheDocument();
    expect(
      screen.getByText(/does not remove companion access/),
    ).toBeInTheDocument();
  });

  it("does not invent consent when no premium grant exists", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    open();

    expect(await screen.findByText(/have not opted in/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("requires the exact confirmation phrase before deleting", async () => {
    const { socket, onDeleted } = open();
    const button = screen.getByRole("button", {
      name: "Permanently delete my account",
    });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "delete" },
    });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(button);

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(socket?.emit).toHaveBeenCalledWith(
      "delete_account",
      { confirmation: "DELETE" },
      expect.any(Function),
    );
  });

  it("shows server refusal and keeps the account screen open", async () => {
    const { onDeleted } = open({
      response: { ok: false, message: "Deletion unavailable" },
    });
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Permanently delete my account" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Deletion unavailable",
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("requires a live verified server connection", async () => {
    open({ socket: null });
    fireEvent.change(screen.getByLabelText("Type DELETE to confirm"), {
      target: { value: "DELETE" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Permanently delete my account" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/Reconnect/);
  });
});
