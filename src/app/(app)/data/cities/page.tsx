import { getCities } from "@/server/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EditableFeesTable } from "@/components/market/editable-fees-table";
import { Info, Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CitiesDataPage() {
  const cities = await getCities();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">טבלאות אגרות והיטלי פיתוח</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          התעריפים העירוניים (₪ למ״ר בנוי) — עלות נסתרת מרכזית. ערכו ושמרו כל ערך ישירות בטבלה.
        </p>
      </div>

      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-[hsl(var(--accent))]" />
          <p className="text-foreground/90">
            המספרים מבוססי <b>טווחים ריאליים מחוקי העזר העירוניים</b> ואומתו מול פרסומים ברשת (סדרי גודל נכונים
            ל-2026). אין API מרכזי לאגרות — לכן הם ניתנים לעריכה ידנית לערכים המדויקים של כל רשות.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pencil className="size-4 text-primary" />
            תעריפי רשויות — עריכה
          </CardTitle>
          <CardDescription>לחצו על כל ערך לעריכה; ה״סה״כ״ מתעדכן חי. ‘שמור’ שומר את הרשות.</CardDescription>
        </CardHeader>
        <CardContent className="p-3">
          <EditableFeesTable cities={cities} />
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        * מחיר המכירה למ״ר מתעדכן אוטומטית מעסקאות אמיתיות שמיובאות, וניתן גם לעריכה ידנית כאן.
      </p>
    </div>
  );
}
