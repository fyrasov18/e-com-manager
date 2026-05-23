import { NextResponse } from "next/server";
import { calculateFinanceMetrics } from "@/lib/finance";
import { getOrCreateDefaultTeamId } from "@/lib/default-team";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let teamId = searchParams.get("teamId")?.trim();
    
    if (!teamId || teamId === "default-team") {
      teamId = await getOrCreateDefaultTeamId();
    }

    const metrics = await calculateFinanceMetrics(teamId);

    return NextResponse.json({
      success: true,
      data: metrics
    });

  } catch (error) {
    console.error("[Finance API Error]", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Erreur chargement finance", 
        error: error instanceof Error ? error.message : String(error) 
      }, 
      { status: 500 }
    );
  }
}
