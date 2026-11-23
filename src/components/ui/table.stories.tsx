import type { Meta, StoryObj } from "@storybook/nextjs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = {
  title: "UI/Table",
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>商品名</TableHead>
          <TableHead>ブランド</TableHead>
          <TableHead className="text-right">数量</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>テスト商品A</TableCell>
          <TableCell>ブランドA</TableCell>
          <TableCell className="text-right">3</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>テスト商品B</TableCell>
          <TableCell>ブランドB</TableCell>
          <TableCell className="text-right">1</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
