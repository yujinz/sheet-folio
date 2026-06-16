// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImageKind, SongImage } from "@/lib/types";

// Mock the useLocale hook
vi.mock("@/lib/useLocale", () => ({
  useLocale: () => ({
    t: {
      staff: "Staff",
      numbered: "Numbered",
      source: "Source",
      exitPager: "Exit pager",
      previousPage: "Previous page",
      nextPage: "Next page",
    },
    locale: "en-US",
  }),
}));

// Import after mocks
import { Pager } from "@/components/Detail";

afterEach(() => {
  cleanup();
});

function makeImage(id: number, kind: ImageKind): SongImage {
  return {
    id,
    songId: 1,
    kind,
    url: `/images/${kind}/${id}.jpg`,
    filename: `${id}.jpg`,
    sortOrder: 0,
    sourceUrl: null,
    createdAt: "2024-01-01T00:00:00.000Z",
  };
}

describe("Pager", () => {
  it("resets index to 0 when switching tabs", async () => {
    const user = userEvent.setup();
    const setTab = vi.fn();
    const setIndex = vi.fn();

    const staffImages = [makeImage(1, "staff"), makeImage(2, "staff")];

    render(
      <Pager
        images={staffImages}
        tab="staff"
        setTab={setTab}
        index={1}
        setIndex={setIndex}
        zoom={100}
      />
    );

    // Click the "numbered" tab button
    await user.click(screen.getByText("Numbered"));

    // setTab should be called with "numbered"
    expect(setTab).toHaveBeenCalledWith("numbered");
    // setIndex should be called with 0 to reset to first image
    expect(setIndex).toHaveBeenCalledWith(0);
  });

  it("renders the current image", () => {
    const images = [makeImage(1, "staff")];

    const { container } = render(
      <Pager
        images={images}
        tab="staff"
        setTab={vi.fn()}
        index={0}
        setIndex={vi.fn()}
        zoom={100}
      />
    );

    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img).toHaveAttribute("src", "/images/staff/1.jpg");
  });

  it("shows source link when image has sourceUrl", () => {
    const images: SongImage[] = [
      { ...makeImage(1, "staff"), sourceUrl: "https://example.com/sheet" },
    ];

    render(
      <Pager
        images={images}
        tab="staff"
        setTab={vi.fn()}
        index={0}
        setIndex={vi.fn()}
        zoom={100}
      />
    );

    expect(screen.getByText(/example.com\/sheet/)).toBeInTheDocument();
  });

  it("navigates to previous image", async () => {
    const user = userEvent.setup();
    const setIndex = vi.fn();
    const images = [makeImage(1, "staff"), makeImage(2, "staff")];

    render(
      <Pager
        images={images}
        tab="staff"
        setTab={vi.fn()}
        index={1}
        setIndex={setIndex}
        zoom={100}
      />
    );

    // Click the left half to go previous
    const leftButton = screen.getByLabelText("Previous page");
    await user.click(leftButton);

    expect(setIndex).toHaveBeenCalledWith(0);
  });

  it("navigates to next image", async () => {
    const user = userEvent.setup();
    const setIndex = vi.fn();
    const images = [makeImage(1, "staff"), makeImage(2, "staff")];

    render(
      <Pager
        images={images}
        tab="staff"
        setTab={vi.fn()}
        index={0}
        setIndex={setIndex}
        zoom={100}
      />
    );

    const rightButton = screen.getByLabelText("Next page");
    await user.click(rightButton);

    expect(setIndex).toHaveBeenCalledWith(1);
  });

  it("closes pager when exit button is clicked", async () => {
    const user = userEvent.setup();
    const setIndex = vi.fn();
    const images = [makeImage(1, "staff")];

    render(
      <Pager
        images={images}
        tab="staff"
        setTab={vi.fn()}
        index={0}
        setIndex={setIndex}
        zoom={100}
      />
    );

    const exitButton = screen.getByLabelText("Exit pager");
    await user.click(exitButton);

    expect(setIndex).toHaveBeenCalledWith(null);
  });

  it("does not crash when index is out of bounds", () => {
    const images = [makeImage(1, "staff")];

    // index=5 is out of bounds for a single image
    expect(() =>
      render(
        <Pager
          images={images}
          tab="staff"
          setTab={vi.fn()}
          index={5}
          setIndex={vi.fn()}
          zoom={100}
        />
      )
    ).not.toThrow();
  });
});