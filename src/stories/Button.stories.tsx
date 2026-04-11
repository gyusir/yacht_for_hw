import type { Meta, StoryObj } from "@storybook/react-vite";

function Button({
  label,
  variant = "primary",
  onClick,
}: {
  label: string;
  variant?: "primary" | "secondary";
  onClick?: () => void;
}) {
  const base = "rounded-sm px-4 py-2 font-medium transition";
  const styles =
    variant === "primary"
      ? "bg-accent text-white hover:bg-accent-hover"
      : "bg-surface text-foreground hover:bg-surface-hover border border-border";

  return (
    <button className={`${base} ${styles}`} onClick={onClick}>
      {label}
    </button>
  );
}

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary"] },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { label: "Primary Button", variant: "primary" },
};

export const Secondary: Story = {
  args: { label: "Secondary Button", variant: "secondary" },
};
