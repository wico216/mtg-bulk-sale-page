import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOrderById } from "@/db/orders";
import { isAdminEmail } from "@/lib/auth/helpers";
import { OrderDetail } from "../_components/order-detail";

export const metadata: Metadata = {
  title: "Order Detail -- Viki MTG Bulk Store",
};

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/admin/login");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/admin/access-denied");
  }

  const { id } = await params;
  const order = await getOrderById(id);

  if (!order) {
    notFound();
  }

  return <OrderDetail order={order} />;
}
