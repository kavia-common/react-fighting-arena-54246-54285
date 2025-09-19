import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders app header", () => {
  render(<App />);
  const title = screen.getByText(/Fighting Arena/i);
  expect(title).toBeInTheDocument();
});
