import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOrderById, getOrderTimeline } from "@/db/orders";
import { isAdminEmail } from "@/lib/auth/helpers";
import {
  e2eFixtureOrderTimeline,
  e2eFixturesEnabled,
  getE2eFixtureAdminOrderDetail,
} from "@/lib/e2e-fixtures";
import { OrderDetail } from "../_components/order-detail";

export const metadata: Metadata = {
  title: "Order Detail — Wiko's Spellbook",
};

export const dynamic = "force-dynamic";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (e2eFixturesEnabled()) {
    const order = getE2eFixtureAdminOrderDetail(id);
    if (!order) {
      notFound();
    }
    return <OrderDetail order={order} timeline={e2eFixtureOrderTimeline} />;
  }

  const session = await auth();

  if (!session?.user) {
    redirect("/admin/login");
  }

  if (!isAdminEmail(session.user.email)) {
    redirect("/admin/access-denied");
  }

  const [order, timeline] = await Promise.all([
    getOrderById(id),
    getOrderTimeline(id),
  ]);

  if (!order) {
    notFound();
  }

  return <OrderDetail order={order} timeline={timeline} />;
}
