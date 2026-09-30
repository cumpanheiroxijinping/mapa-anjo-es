<template>
  <div class="table-scroll">
    <table class="data-table">
      <thead>
        <tr>
          <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
          <th v-if="$slots.actions">Ações</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="rowKey ? row[rowKey] : i">
          <td v-for="col in columns" :key="col.key" :class="{ mono: col.mono }">
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
              {{ row[col.key] }}
            </slot>
          </td>
          <td v-if="$slots.actions">
            <slot name="actions" :row="row" />
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + ($slots.actions ? 1 : 0)" class="muted" style="padding: 20px; text-align: center;">
            {{ emptyText }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
defineProps({
  columns: { type: Array, required: true }, // [{ key, label, mono? }]
  rows: { type: Array, default: () => [] },
  rowKey: { type: String, default: '' },
  emptyText: { type: String, default: 'Sem registros.' },
});
</script>
