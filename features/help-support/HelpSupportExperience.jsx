"use client";

import React, { useMemo, useState } from "react";
import { helpSupportDemoContent } from "./demoContent";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function Card({ children, className = "", as: Component = "section", ...props }) {
  return (
    <Component className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)} {...props}>
      {children}
    </Component>
  );
}

function BackHeader({ title, subtitle, onBack, action }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-slate-200 bg-white px-3 py-3 md:rounded-xl md:border md:px-4 md:shadow-sm">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-sm text-slate-800 transition hover:bg-blue-50 hover:text-[#0F87F9] md:h-9 md:w-9"
      >
        <i className="pi pi-chevron-left" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-bold text-slate-950 md:text-lg">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-slate-500 md:text-sm">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{title}</h2>
      {action}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    Open: "bg-amber-50 text-amber-700 ring-amber-100",
    Replied: "bg-blue-50 text-blue-700 ring-blue-100",
    Resolved: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  };

  return (
    <span className={cx("inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1", styles[status])}>
      {status}
    </span>
  );
}

function OutcomeBadge({ value }) {
  const failed = value === "Failed";
  return (
    <span className={cx("inline-flex rounded-full px-2.5 py-1 text-xs font-bold", failed ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700")}>
      {value}
    </span>
  );
}

function MetricCard({ label, value, icon, onClick }) {
  const Component = onClick ? "button" : "section";

  return (
    <Card
      as={Component}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cx(
        "min-w-0 p-3 text-left",
        onClick && "transition hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#0F87F9]">
          <i className={cx(icon, "text-base")} aria-hidden />
        </div>
      </div>
    </Card>
  );
}

function MobileStatStrip({ stats }) {
  return (
    <Card className="grid grid-cols-4 divide-x divide-slate-100 px-2 py-4">
      {stats.map((stat) => (
        <div key={stat.label} className="text-center">
          <p className="text-xl font-black text-slate-950">{stat.value}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{stat.label}</p>
        </div>
      ))}
    </Card>
  );
}

function TicketCard({ ticket, onOpen, compact = false }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ticket)}
      className={cx(
        "block rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md",
        compact && "w-[280px] shrink-0"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{ticket.id}</p>
          <h3 className="mt-2 font-bold leading-5 text-slate-950">{ticket.title}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {ticket.category} · {ticket.updatedAt}
          </p>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
      {!compact ? <p className="mt-3 text-sm leading-6 text-slate-600">{ticket.description}</p> : null}
    </button>
  );
}

function OpenTicketsRail({ tickets, onViewAll, onOpen }) {
  return (
    <section>
      <SectionHeader
        title="My open tickets"
        action={
          <button type="button" onClick={onViewAll} className="text-sm font-bold text-[#0F87F9]">
            View tickets
          </button>
        }
      />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} compact onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function CategoryCard({ category, featured = false, onOpen }) {
  const icons = {
    dcr: "pi pi-file",
    expenses: "pi pi-receipt",
    orders: "pi pi-box",
    attendance: "pi pi-calendar",
    app: "pi pi-mobile",
  };

  return (
    <Card
      as="button"
      type="button"
      onClick={() => onOpen(category)}
      className={cx("min-w-0 p-4 text-left transition hover:border-blue-200 hover:shadow-md", featured && "col-span-2")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#0F87F9] bg-blue-50 text-[#0F87F9]">
          <i className={cx(icons[category.id] || "pi pi-folder-open", "text-base")} aria-hidden />
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#0F87F9]">
          {category.count} {category.count === 1 ? "article" : "articles"}
        </span>
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-950">{category.name}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{category.description}</p>
    </Card>
  );
}

function CollectionBento({ categories, onOpen }) {
  return (
    <section>
      <SectionHeader title="Browse by collection" />
      <div className="grid grid-cols-2 gap-3">
        {categories.map((category, index) => (
          <CategoryCard key={category.id} category={category} featured={index === 0} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function ArticleListItem({ article, onOpen, index }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(article)}
      className="flex w-full items-center gap-4 rounded-xl bg-white px-4 py-4 text-left shadow-sm ring-1 ring-slate-100 transition hover:ring-blue-200"
    >
      {typeof index === "number" ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-[#0F87F9]">
          {index + 1}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-5 text-slate-950">{article.title}</p>
        <p className="mt-1 text-sm text-slate-500">
          {article.category}
          {article.views ? ` · ${article.views}` : ""}
        </p>
        {article.summary ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{article.summary}</p> : null}
      </div>
      <i className="pi pi-chevron-right text-slate-400" aria-hidden />
    </button>
  );
}

function RecentlyViewed({ items, onOpen }) {
  return (
    <section>
      <SectionHeader title="Recently viewed" />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:px-0">
        {items.map((article) => (
          <button
            key={article.id}
            type="button"
            onClick={() => onOpen(article)}
            className="w-[260px] shrink-0 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 md:w-auto"
          >
            <h3 className="font-bold leading-5 text-slate-950">{article.title}</h3>
            <p className="mt-3 text-sm font-medium text-slate-500">{article.category}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function TrendingList({ items, onOpen }) {
  return (
    <section>
      <SectionHeader title="Trending this week" />
      <div className="space-y-3">
        {items.map((article, index) => (
          <ArticleListItem key={article.id} article={article} index={index} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function TicketFilters({ activeFilter, setActiveFilter, counts }) {
  const filters = [
    { id: "active", label: `Active (${counts.active})` },
    { id: "resolved", label: `Resolved (${counts.resolved})` },
    { id: "all", label: `All (${counts.all})` },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => setActiveFilter(filter.id)}
          className={cx(
            "h-10 shrink-0 rounded-full border px-4 text-sm font-bold transition",
            activeFilter === filter.id
              ? "border-[#0F87F9] bg-[#0F87F9] text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200"
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

const TICKET_FIELD_FILTERS = [
  { id: "id", label: "ID", getValue: (ticket) => ticket.id },
  { id: "title", label: "Subject", getValue: (ticket) => ticket.title },
  { id: "status", label: "Status", getValue: (ticket) => ticket.status },
  { id: "category", label: "Category", getValue: (ticket) => ticket.category },
  { id: "assignedTo", label: "Assigned To", getValue: (ticket) => ticket.assignedTo },
  { id: "customer", label: "Customer", getValue: (ticket) => ticket.customer },
];

function TicketDataTable({ tickets, onOpen, selectedIds, onToggleTicket, onToggleAll }) {
  const allSelected = tickets.length > 0 && tickets.every((ticket) => selectedIds.includes(ticket.id));
  const partlySelected = tickets.some((ticket) => selectedIds.includes(ticket.id)) && !allSelected;

  return (
    <Card className="hidden min-w-0 overflow-x-auto lg:block">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
            <th className="w-10 px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(node) => {
                  if (node) node.indeterminate = partlySelected;
                }}
                onChange={onToggleAll}
                className="h-4 w-4 rounded border-slate-300 text-[#0F87F9] focus:ring-[#0F87F9]"
                aria-label="Select all tickets"
              />
            </th>
            <th className="px-4 py-3 font-semibold">ID</th>
            <th className="px-4 py-3 font-semibold">Subject</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">First response</th>
            <th className="px-4 py-3 font-semibold">Resolution</th>
            <th className="px-4 py-3 font-semibold">Assigned To</th>
            <th className="px-4 py-3 font-semibold">Customer</th>
            <th className="px-4 py-3 text-right font-semibold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="hover:bg-slate-50/80">
              <td className="px-4 py-4">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(ticket.id)}
                  onChange={() => onToggleTicket(ticket.id)}
                  className="h-4 w-4 rounded border-slate-300 text-[#0F87F9] focus:ring-[#0F87F9]"
                  aria-label={`Select ${ticket.id}`}
                />
              </td>
              <td className="px-4 py-4 font-semibold text-slate-700">{ticket.id.replace("HD-", "")}</td>
              <td className="max-w-[340px] px-4 py-4">
                <p className="font-semibold text-slate-950">{ticket.title}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{ticket.category}</p>
              </td>
              <td className="px-4 py-4">
                <span className={cx("mr-2 inline-block h-2 w-2 rounded-full", ticket.status === "Resolved" ? "bg-emerald-500" : "bg-red-500")} />
                {ticket.status}
              </td>
              <td className="px-4 py-4">
                <OutcomeBadge value={ticket.firstResponse || "Passed"} />
              </td>
              <td className="px-4 py-4">
                <OutcomeBadge value={ticket.resolution || "Pending"} />
              </td>
              <td className="px-4 py-4 text-slate-600">{ticket.assignedTo || "Support"}</td>
              <td className="px-4 py-4 text-slate-600">{ticket.customer || "Arun Kumar"}</td>
              <td className="px-4 py-4 text-right">
                <button
                  type="button"
                  onClick={() => onOpen(ticket)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#0F87F9] hover:bg-blue-50"
                >
                  View ticket
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MobileTicketRow({ ticket, onOpen }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <button type="button" onClick={() => onOpen(ticket)} className="w-full min-w-0 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{ticket.id}</p>
            <h3 className="mt-1 font-bold leading-5 text-slate-950">{ticket.title}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {ticket.category} · {ticket.updatedAt}
            </p>
          </div>
          <StatusBadge status={ticket.status} />
        </div>
      </button>
    </div>
  );
}

function TicketsPanel({ tickets, onOpen, activeFilter, setActiveFilter, counts, onCreate, onDeleteTickets, fill = false }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterField, setFilterField] = useState("title");
  const [filterValue, setFilterValue] = useState("");

  const fieldConfig = TICKET_FIELD_FILTERS.find((field) => field.id === filterField) || TICKET_FIELD_FILTERS[1];
  const filteredTickets = useMemo(() => {
    const normalized = filterValue.trim().toLowerCase();
    if (!normalized) return tickets;
    return tickets.filter((ticket) => String(fieldConfig.getValue(ticket) || "").toLowerCase().includes(normalized));
  }, [fieldConfig, filterValue, tickets]);

  const visibleSelectedIds = selectedIds.filter((id) => filteredTickets.some((ticket) => ticket.id === id));
  const toggleTicket = (ticketId) => {
    setSelectedIds((current) => (current.includes(ticketId) ? current.filter((id) => id !== ticketId) : [...current, ticketId]));
  };
  const toggleAll = () => {
    const allVisibleSelected = filteredTickets.length > 0 && filteredTickets.every((ticket) => selectedIds.includes(ticket.id));
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !filteredTickets.some((ticket) => ticket.id === id));
      }
      return Array.from(new Set([...current, ...filteredTickets.map((ticket) => ticket.id)]));
    });
  };
  const deleteSelected = () => {
    if (!visibleSelectedIds.length) return;
    onDeleteTickets(visibleSelectedIds);
    setSelectedIds((current) => current.filter((id) => !visibleSelectedIds.includes(id)));
  };

  return (
    <section className={cx("flex min-w-0 flex-col gap-3", fill ? "h-full min-h-0 flex-1 overflow-hidden" : "shrink-0 overflow-visible")}>
      <div className="shrink-0 flex flex-col gap-3 border-b border-slate-200 bg-white/80 py-3 md:rounded-xl md:border md:px-4 md:shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="text-lg font-bold text-slate-950">Tickets</h2>
            <span className="text-sm text-slate-400">/</span>
            <span className="text-sm font-semibold text-slate-600">List</span>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"
          >
            <i className="pi pi-plus" aria-hidden />
            Create
          </button>
        </div>
        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <TicketFilters activeFilter={activeFilter} setActiveFilter={setActiveFilter} counts={counts} />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-slate-100 p-1 md:flex-none">
              <i className="pi pi-filter ml-2 text-xs text-slate-500" aria-hidden />
              <select
                value={filterField}
                onChange={(event) => setFilterField(event.target.value)}
                className="h-8 rounded-md border-0 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
              >
                {TICKET_FIELD_FILTERS.map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.label}
                  </option>
                ))}
              </select>
              <input
                value={filterValue}
                onChange={(event) => setFilterValue(event.target.value)}
                placeholder={`Filter by ${fieldConfig.label}`}
                className="h-8 min-w-[120px] flex-1 rounded-md border-0 bg-white px-2 text-xs outline-none placeholder:text-slate-400 md:w-44"
              />
            </div>
            <button
              type="button"
              onClick={deleteSelected}
              disabled={!visibleSelectedIds.length}
              className="h-9 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 hover:bg-red-100 disabled:bg-slate-100 disabled:text-slate-400"
            >
              Delete{visibleSelectedIds.length ? ` (${visibleSelectedIds.length})` : ""}
            </button>
          </div>
        </div>
      </div>

      <div className={cx("min-w-0", fill ? "min-h-0 flex-1 overflow-auto" : "overflow-visible")}>
        {filteredTickets.length ? (
          <>
          <TicketDataTable
            tickets={filteredTickets}
            onOpen={onOpen}
            selectedIds={selectedIds}
            onToggleTicket={toggleTicket}
            onToggleAll={toggleAll}
          />
          <div className="grid gap-3 lg:hidden">
            {filteredTickets.map((ticket) => (
              <MobileTicketRow
                key={ticket.id}
                ticket={ticket}
                onOpen={onOpen}
              />
            ))}
          </div>
          </>
        ) : (
          <EmptyState message="No tickets match your search and filter." />
        )}
      </div>
    </section>
  );
}

function CreateTicketForm({ content, onSubmit, onCancel }) {
  const [category, setCategory] = useState(content.categories[0]?.name || "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const canSubmit = subject.trim() && description.trim();

  const submit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      category,
      subject: subject.trim(),
      description: description.trim(),
    });
    setSubject("");
    setDescription("");
  };

  return (
    <Card className="p-4 md:p-5">
      <form onSubmit={submit} className="grid gap-4">
        <fieldset>
          <legend className="mb-2 block text-sm font-semibold text-slate-700">{content.ticketForm.categoryLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {content.categories.map((item) => {
              const selected = category === item.name;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.name)}
                  className={cx(
                    "min-h-10 rounded-full border px-4 py-2 text-sm font-bold transition",
                    selected
                      ? "border-[#0F87F9] bg-[#0F87F9] text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-950 hover:border-blue-200 hover:bg-blue-50"
                  )}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">{content.ticketForm.subjectLabel}</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={content.ticketForm.subjectPlaceholder}
            className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#0F87F9] focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">{content.ticketForm.descriptionLabel}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={content.ticketForm.descriptionPlaceholder}
            rows={5}
            className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-[#0F87F9] focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 text-sm font-semibold text-slate-500"
          >
            <i className="pi pi-paperclip" aria-hidden />
            Attach files
          </button>
          <div className="flex gap-2">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0F87F9] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-600 disabled:bg-blue-200"
            >
              <i className="pi pi-plus" aria-hidden />
              {content.ticketForm.submitLabel}
            </button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function TicketConversation({ ticket, onBack, onAddComment }) {
  const [comment, setComment] = useState("");
  const canSend = comment.trim();

  const submit = (event) => {
    event.preventDefault();
    if (!canSend) return;
    onAddComment(ticket.id, comment.trim());
    setComment("");
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-slate-100">
      <BackHeader title={ticket.title} subtitle={`${ticket.id} · ${ticket.category}`} onBack={onBack} action={<StatusBadge status={ticket.status} />} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-4">
        {(ticket.conversation || []).map((message) => {
          const own = message.tone === "user";
          return (
            <div key={message.id} className={cx("flex flex-col", own ? "items-end" : "items-start")}>
              <div
                className={cx(
                  "max-w-[680px] rounded-xl px-3.5 py-2.5 text-xs leading-5 md:text-sm",
                  own ? "bg-[#0F87F9] text-white" : "bg-white text-slate-950 shadow-sm"
                )}
              >
                {message.message}
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-slate-500 md:text-xs">
                {message.author} · {message.role} · {message.time}
              </p>
            </div>
          );
        })}
      </div>
      <form onSubmit={submit} className="border-t border-slate-200 bg-white p-2.5 md:p-3">
        <div className="flex gap-2">
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a comment..."
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#0F87F9] focus:ring-4 focus:ring-blue-100 md:text-sm"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0F87F9] px-4 text-xs font-bold text-white disabled:bg-blue-200 md:text-sm"
          >
            Send
          </button>
        </div>
      </form>
    </section>
  );
}

function CollectionView({ category, articles, onBack, onArticle }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <BackHeader title={category.name} subtitle={category.description} onBack={onBack} />
      {articles.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {articles.map((article) => (
            <ArticleListItem key={article.id} article={article} onOpen={onArticle} />
          ))}
        </div>
      ) : (
        <EmptyState message="No articles match your search in this collection." />
      )}
    </div>
  );
}

function ArticlesResultView({ title, subtitle, articles, onBack, onArticle }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <BackHeader title={title} subtitle={subtitle} onBack={onBack} />
      {articles.length ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-3 xl:grid-cols-2">
            {articles.map((article) => (
              <ArticleListItem key={article.id} article={article} onOpen={onArticle} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState message="No articles match your search." />
      )}
    </div>
  );
}

function ArticleView({ article, onBack }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <BackHeader title={article.title} subtitle={`${article.category} · ${article.updatedAt || "Knowledge base"}`} onBack={onBack} />
      <Card className="min-h-0 flex-1 p-4 md:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0F87F9]">Knowledge base</p>
        <h2 className="mt-2 text-lg font-bold leading-tight text-slate-950 md:text-xl">{article.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{article.summary}</p>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-700 md:p-4 md:text-sm">{article.body}</div>
      </Card>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <Card className="p-6 text-center">
      <i className="pi pi-search text-2xl text-slate-300" aria-hidden />
      <p className="mt-2 text-sm font-medium text-slate-500">{message}</p>
    </Card>
  );
}

function MobileTabs({ activeTab, onSelect, ticketCount }) {
  const tabs = [
    { id: "dashboard", label: "Articles", icon: "pi pi-book" },
    { id: "raise", label: "Raise ticket", icon: "pi pi-plus-circle" },
    { id: "tickets", label: "My tickets", icon: "pi pi-comments", badge: ticketCount },
  ];

  return (
    <nav className="sticky bottom-3 z-20 mx-auto mt-5 max-w-[320px] rounded-3xl bg-white p-1.5 shadow-[0_14px_34px_rgba(20,25,31,0.16)]">
      <div className="grid grid-cols-3 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cx(
              "relative flex min-h-[46px] flex-col items-center justify-center rounded-2xl text-[10px] font-bold transition",
              activeTab === tab.id ? "bg-blue-50 text-[#0F87F9]" : "text-slate-500"
            )}
          >
            <i className={cx(tab.icon, "mb-0.5 text-base")} aria-hidden />
            {tab.label}
            {tab.badge ? (
              <span className="absolute right-4 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] text-white">
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default function HelpSupportExperience({ content = helpSupportDemoContent, className = "" }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ type: "home" });
  const [ticketFilter, setTicketFilter] = useState("active");
  const [tickets, setTickets] = useState(content.tickets);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (text) => !normalizedQuery || String(text).toLowerCase().includes(normalizedQuery);

  const articleById = useMemo(() => {
    const map = new Map();
    content.articles.forEach((article) => map.set(article.id, article));
    return map;
  }, [content.articles]);

  const enrichedRecent = useMemo(
    () => content.recentlyViewed.map((item) => ({ ...articleById.get(item.articleId), ...item, id: item.articleId || item.id })),
    [articleById, content.recentlyViewed]
  );
  const enrichedTrending = useMemo(
    () => content.trending.map((item) => ({ ...articleById.get(item.id), ...item })),
    [articleById, content.trending]
  );

  const filteredCategories = useMemo(
    () => content.categories.filter((category) => matches(`${category.name} ${category.description}`)),
    [content.categories, normalizedQuery]
  );
  const filteredArticles = useMemo(
    () => content.articles.filter((article) => matches(`${article.title} ${article.category} ${article.summary} ${article.body}`)),
    [content.articles, normalizedQuery]
  );
  const filteredTrending = useMemo(
    () => enrichedTrending.filter((article) => matches(`${article.title} ${article.category} ${article.summary}`)),
    [enrichedTrending, normalizedQuery]
  );
  const filteredRecent = useMemo(
    () => enrichedRecent.filter((article) => matches(`${article.title} ${article.category} ${article.summary || ""}`)),
    [enrichedRecent, normalizedQuery]
  );
  const searchedTickets = useMemo(
    () =>
      tickets.filter((ticket) =>
        matches(`${ticket.id} ${ticket.title} ${ticket.category} ${ticket.status} ${ticket.description} ${ticket.assignedTo} ${ticket.customer}`)
      ),
    [tickets, normalizedQuery]
  );

  const ticketCounts = useMemo(
    () => ({
      active: tickets.filter((ticket) => ticket.status !== "Resolved").length,
      resolved: tickets.filter((ticket) => ticket.status === "Resolved").length,
      all: tickets.length,
    }),
    [tickets]
  );
  const visibleTickets = searchedTickets.filter((ticket) => {
    if (ticketFilter === "resolved") return ticket.status === "Resolved";
    if (ticketFilter === "active") return ticket.status !== "Resolved";
    return true;
  });
  const openTickets = searchedTickets.filter((ticket) => ticket.status !== "Resolved");

  const selectedTicket = tickets.find((ticket) => ticket.id === view.ticketId);
  const selectedCategory = content.categories.find((category) => category.id === view.categoryId);
  const selectedArticle = content.articles.find((article) => article.id === view.articleId) || enrichedTrending.find((article) => article.id === view.articleId);

  const goHome = () => setView({ type: "home" });
  const goTickets = () => {
    setTicketFilter("active");
    setView({ type: "tickets" });
  };
  const goResolvedTickets = () => {
    setTicketFilter("resolved");
    setView({ type: "tickets" });
  };
  const goArticle = (article) => setView({ type: "article", articleId: article.id });
  const goCollection = (category) => setView({ type: "collection", categoryId: category.id });
  const goTicket = (ticket) => setView({ type: "ticket", ticketId: ticket.id });
  const goArticles = () => setView({ type: "articles" });
  const goSolvedSolo = () => setView({ type: "solvedSolo" });

  const metrics = [
    { label: "Open tickets", value: ticketCounts.active, icon: "pi pi-comments", onClick: goTickets },
    { label: "Resolved", value: ticketCounts.resolved, icon: "pi pi-check-circle", onClick: goResolvedTickets },
    { label: "Articles", value: content.categories.reduce((sum, item) => sum + item.count, 0), icon: "pi pi-book", onClick: goArticles },
    { label: "Solved solo", value: "4", icon: "pi pi-bolt", onClick: goSolvedSolo },
  ];

  const createTicket = (ticket) => {
    const created = {
      id: `HD-${1050 + tickets.length}`,
      status: "Open",
      title: ticket.subject,
      category: ticket.category,
      updatedAt: "Just now",
      customer: content.user?.name || "Demo User",
      assignedTo: "Helpdesk",
      firstResponse: "Failed",
      resolution: "Failed",
      description: ticket.description,
      conversation: [
        {
          id: `msg-${Date.now()}`,
          author: "You",
          role: "Field team",
          time: "Just now",
          tone: "user",
          message: ticket.description,
        },
      ],
    };
    setTickets((current) => [created, ...current]);
    setTicketFilter("active");
    setView({ type: "ticket", ticketId: created.id });
  };

  const addComment = (ticketId, message) => {
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              status: ticket.status === "Resolved" ? "Resolved" : "Replied",
              updatedAt: "Just now",
              conversation: [
                ...(ticket.conversation || []),
                {
                  id: `msg-${ticketId}-${Date.now()}`,
                  author: "You",
                  role: "Field team",
                  time: "Just now",
                  tone: "user",
                  message,
                },
              ],
            }
          : ticket
      )
    );
  };

  const deleteTickets = (ticketIds) => {
    setTickets((current) => current.filter((ticket) => !ticketIds.includes(ticket.id)));
  };

  const dashboard = (
    <div className="flex min-h-full shrink-0 flex-col gap-5">
      <div className="hidden grid-cols-4 gap-3 md:grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>
      <div className="md:hidden">
        <MobileStatStrip stats={content.stats} />
      </div>
      <div className="grid min-h-0 gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {openTickets.length ? (
            <OpenTicketsRail tickets={openTickets} onOpen={goTicket} onViewAll={goTickets} />
          ) : (
            <EmptyState message="No active tickets match your search." />
          )}
          {filteredCategories.length ? (
            <CollectionBento categories={filteredCategories} onOpen={goCollection} />
          ) : (
            <EmptyState message="No collections match your search." />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {filteredTrending.length ? <TrendingList items={filteredTrending} onOpen={goArticle} /> : <EmptyState message="No trending articles match your search." />}
          {filteredRecent.length ? <RecentlyViewed items={filteredRecent} onOpen={goArticle} /> : <EmptyState message="No recently viewed articles match your search." />}
        </div>
      </div>
      <TicketsPanel
        tickets={visibleTickets}
        onOpen={goTicket}
        activeFilter={ticketFilter}
        setActiveFilter={setTicketFilter}
        counts={ticketCounts}
        onCreate={() => setView({ type: "create" })}
        onDeleteTickets={deleteTickets}
      />
    </div>
  );

  let mainView = dashboard;
  if (view.type === "tickets") {
    mainView = (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
        <BackHeader title="Tickets" subtitle="Active, resolved and all ticket records" onBack={goHome} />
        <TicketsPanel
          tickets={visibleTickets}
          onOpen={goTicket}
          activeFilter={ticketFilter}
          setActiveFilter={setTicketFilter}
          counts={ticketCounts}
          onCreate={() => setView({ type: "create" })}
          onDeleteTickets={deleteTickets}
          fill
        />
      </div>
    );
  } else if (view.type === "create") {
    mainView = (
      <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
        <BackHeader title="Create ticket" subtitle="Raise a local demo support request" onBack={goHome} />
        <CreateTicketForm content={content} onSubmit={createTicket} onCancel={goHome} />
      </div>
    );
  } else if (view.type === "ticket" && selectedTicket) {
    mainView = <TicketConversation ticket={selectedTicket} onBack={() => setView({ type: "tickets" })} onAddComment={addComment} />;
  } else if (view.type === "collection" && selectedCategory) {
    const collectionArticles = filteredArticles.filter((article) => article.category === selectedCategory.name);
    mainView = <CollectionView category={selectedCategory} articles={collectionArticles} onBack={goHome} onArticle={goArticle} />;
  } else if (view.type === "articles") {
    mainView = (
      <ArticlesResultView
        title="Articles"
        subtitle={`${filteredArticles.length} knowledge base results`}
        articles={filteredArticles}
        onBack={goHome}
        onArticle={goArticle}
      />
    );
  } else if (view.type === "solvedSolo") {
    mainView = (
      <ArticlesResultView
        title="Solved solo"
        subtitle="Articles that help resolve common issues without support"
        articles={filteredTrending.slice(0, 4)}
        onBack={goHome}
        onArticle={goArticle}
      />
    );
  } else if (view.type === "article" && selectedArticle) {
    mainView = <ArticleView article={selectedArticle} onBack={goHome} />;
  }

  const isHomeView = view.type === "home";

  return (
    <div className={cx("flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 text-slate-950", className)}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-20 pt-4 md:px-6 md:pb-8">
        <div
          className={cx(
            "mx-auto flex w-full max-w-7xl flex-col gap-5",
            isHomeView ? "min-h-full" : "h-full min-h-0 flex-1"
          )}
        >
          {view.type === "home" ? (
            <section className="shrink-0 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm md:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F87F9]">ELBRIT HELP CENTER</p>
                  <h1 className="mt-2 text-2xl font-bold text-[#18265c] md:text-3xl">Help & Support</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Browse articles, raise tickets, and track local demo conversations before ERP integration.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView({ type: "create" })}
                  className="hidden h-10 items-center justify-center gap-2 rounded-lg bg-[#0F87F9] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-600 md:inline-flex"
                >
                  <i className="pi pi-plus" aria-hidden />
                  Create ticket
                </button>
              </div>
              <label className="mt-4 flex h-11 max-w-2xl items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-[#0F87F9] focus-within:ring-4 focus-within:ring-blue-100">
                <i className="pi pi-search text-slate-400" aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={content.header.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </label>
            </section>
          ) : null}

          <div className={cx("flex flex-col", isHomeView ? "shrink-0" : "min-h-0 flex-1")}>{mainView}</div>
        </div>
      </div>

      {view.type === "home" || view.type === "tickets" || view.type === "create" ? (
        <div className="md:hidden">
          <MobileTabs
            activeTab={view.type === "create" ? "raise" : view.type === "tickets" ? "tickets" : "dashboard"}
            ticketCount={ticketCounts.active}
            onSelect={(tab) => {
              if (tab === "raise") setView({ type: "create" });
              else if (tab === "tickets") goTickets();
              else goHome();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
