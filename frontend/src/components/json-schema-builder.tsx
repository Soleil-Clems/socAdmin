// @soleil-clems: Component - JSON schema builder (MongoDB validation)
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export type SchemaField = {
  name: string;
  bsonType: string;
  required: boolean;
  description?: string;
  // Number constraints
  minimum?: number;
  maximum?: number;
  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  // Enum
  enumValues?: string;
};

const BSON_TYPES = [
  "string",
  "int",
  "long",
  "double",
  "decimal",
  "bool",
  "date",
  "objectId",
  "array",
  "object",
  "null",
] as const;

export function emptyField(): SchemaField {
  return { name: "", bsonType: "string", required: false };
}

/**
 * Convert a list of SchemaField into a MongoDB $jsonSchema validator object.
 */
export function fieldsToJsonSchema(fields: SchemaField[]): Record<string, unknown> {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const f of fields) {
    if (!f.name.trim()) continue;
    const prop: Record<string, unknown> = { bsonType: f.bsonType };
    if (f.description) prop.description = f.description;
    if (f.bsonType === "string") {
      if (f.minLength != null) prop.minLength = f.minLength;
      if (f.maxLength != null) prop.maxLength = f.maxLength;
      if (f.pattern) prop.pattern = f.pattern;
    }
    if (["int", "long", "double", "decimal"].includes(f.bsonType)) {
      if (f.minimum != null) prop.minimum = f.minimum;
      if (f.maximum != null) prop.maximum = f.maximum;
    }
    if (f.enumValues && f.enumValues.trim()) {
      prop.enum = f.enumValues
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    properties[f.name] = prop;
    if (f.required) required.push(f.name);
  }

  const schema: Record<string, unknown> = {
    bsonType: "object",
    properties,
  };
  if (required.length > 0) schema.required = required;
  return { $jsonSchema: schema };
}

/**
 * Parse a $jsonSchema validator into a SchemaField list.
 * Returns null if the validator can't be represented (e.g. nested objects, $and/$or).
 */
export function jsonSchemaToFields(validator: string): SchemaField[] | null {
  if (!validator || validator === "{}") return [];
  try {
    const parsed = JSON.parse(validator);
    const schema = parsed.$jsonSchema;
    if (!schema || typeof schema !== "object") return null;
    const props = schema.properties;
    if (!props || typeof props !== "object") return [];
    const required = new Set<string>(Array.isArray(schema.required) ? schema.required : []);
    const fields: SchemaField[] = [];
    for (const [name, propRaw] of Object.entries(props)) {
      const prop = propRaw as Record<string, unknown>;
      const f: SchemaField = {
        name,
        bsonType: typeof prop.bsonType === "string" ? prop.bsonType : "string",
        required: required.has(name),
      };
      if (typeof prop.description === "string") f.description = prop.description;
      if (typeof prop.minimum === "number") f.minimum = prop.minimum;
      if (typeof prop.maximum === "number") f.maximum = prop.maximum;
      if (typeof prop.minLength === "number") f.minLength = prop.minLength;
      if (typeof prop.maxLength === "number") f.maxLength = prop.maxLength;
      if (typeof prop.pattern === "string") f.pattern = prop.pattern;
      if (Array.isArray(prop.enum)) f.enumValues = prop.enum.join(", ");
      fields.push(f);
    }
    return fields;
  } catch {
    return null;
  }
}

export default function JsonSchemaBuilder({
  fields,
  onChange,
}: {
  fields: SchemaField[];
  onChange: (fields: SchemaField[]) => void;
}) {
  const update = (i: number, patch: Partial<SchemaField>) => {
    const next = fields.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const remove = (i: number) => {
    onChange(fields.filter((_, idx) => idx !== i));
  };

  const add = () => onChange([...fields, emptyField()]);

  const isNumeric = (t: string) => ["int", "long", "double", "decimal"].includes(t);

  return (
    <div className="space-y-2">
      {fields.length === 0 && (
        <p className="text-[11px] text-muted-foreground italic">
          No fields defined. Click "+ Field" to add validation rules.
        </p>
      )}

      {fields.map((f, i) => (
        <div
          key={i}
          className="border border-border rounded-md bg-muted/20 p-2 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Input
              value={f.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="field_name"
              className="flex-1 h-8 text-xs font-mono"
            />
            <select
              value={f.bsonType}
              onChange={(e) => update(i, { bsonType: e.target.value })}
              className="h-8 text-xs bg-background border border-border rounded px-2"
            >
              {BSON_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-[10px] whitespace-nowrap cursor-pointer">
              <Checkbox
                checked={f.required}
                onCheckedChange={(c) => update(i, { required: !!c })}
              />
              required
            </label>
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-destructive hover:bg-destructive/10 px-1.5 py-0.5 rounded text-xs"
              aria-label="Remove field"
            >
              ✕
            </button>
          </div>

          {/* Constraints — type-dependent */}
          {f.bsonType === "string" && (
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                value={f.minLength ?? ""}
                onChange={(e) =>
                  update(i, { minLength: e.target.value ? parseInt(e.target.value, 10) : undefined })
                }
                placeholder="min length"
                className="h-7 text-[11px]"
                min={0}
              />
              <Input
                type="number"
                value={f.maxLength ?? ""}
                onChange={(e) =>
                  update(i, { maxLength: e.target.value ? parseInt(e.target.value, 10) : undefined })
                }
                placeholder="max length"
                className="h-7 text-[11px]"
                min={0}
              />
              <Input
                value={f.pattern ?? ""}
                onChange={(e) => update(i, { pattern: e.target.value || undefined })}
                placeholder="regex pattern"
                className="h-7 text-[11px] font-mono"
              />
            </div>
          )}

          {isNumeric(f.bsonType) && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                value={f.minimum ?? ""}
                onChange={(e) =>
                  update(i, { minimum: e.target.value ? parseFloat(e.target.value) : undefined })
                }
                placeholder="minimum"
                className="h-7 text-[11px]"
              />
              <Input
                type="number"
                value={f.maximum ?? ""}
                onChange={(e) =>
                  update(i, { maximum: e.target.value ? parseFloat(e.target.value) : undefined })
                }
                placeholder="maximum"
                className="h-7 text-[11px]"
              />
            </div>
          )}

          <Input
            value={f.enumValues ?? ""}
            onChange={(e) => update(i, { enumValues: e.target.value || undefined })}
            placeholder="enum: a, b, c (optional)"
            className="h-7 text-[11px]"
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs w-full"
        onClick={add}
      >
        + Field
      </Button>
    </div>
  );
}
