import { render, screen } from "@testing-library/react";
import { FarmTractorsPage } from "./FarmTractorsPage";
describe("FarmTractorsPage", () => {
  it("renders register header", () => {
    render(<FarmTractorsPage initial={{ ok: true, workspace: { tractors: [], caps: { canTractors: true }, listPage: { page: 1, pageSize: 10 } } as any }} />);
    expect(screen.getByText(/register/i)).toBeInTheDocument();
  });
});
