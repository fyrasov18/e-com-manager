import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";
import { listCities, listDistricts, listNeighborhoods, listPickups } from "@/lib/intigo-parcels";

export async function GET(req: NextRequest) {
  try {
    const teamId = await getOrCreateDefaultTeamId();
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind") || "cities";
    if (kind === "cities") return NextResponse.json(await listCities(teamId));
    if (kind === "districts") {
      const cityId = Number(searchParams.get("city_id"));
      if (!Number.isInteger(cityId)) return NextResponse.json({ ok: false, message: "city_id requis." }, { status: 400 });
      return NextResponse.json(await listDistricts(teamId, cityId));
    }
    if (kind === "neighborhoods") {
      const districtId = Number(searchParams.get("district_id"));
      if (!Number.isInteger(districtId)) return NextResponse.json({ ok: false, message: "district_id requis." }, { status: 400 });
      return NextResponse.json(await listNeighborhoods(teamId, districtId));
    }
    if (kind === "pickups") return NextResponse.json(await listPickups(teamId));
    return NextResponse.json({ ok: false, message: "kind inconnu." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, message: "Erreur serveur." }, { status: 500 });
  }
}
