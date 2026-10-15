-- Phase 1: PrepFlow problem authoring. Run this migration in the Supabase SQL editor.
alter table public.profiles add column if not exists is_admin boolean not null default false;

create table if not exists public.problems (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  description text not null check (char_length(trim(description)) > 0),
  constraints text,
  input_format text,
  output_format text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.problem_examples (
  id uuid primary key default gen_random_uuid(), problem_id uuid not null references public.problems(id) on delete cascade,
  input text not null, output text not null, explanation text, display_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.problem_test_cases (
  id uuid primary key default gen_random_uuid(), problem_id uuid not null references public.problems(id) on delete cascade,
  input text not null, expected_output text not null, is_hidden boolean not null default false, display_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.topics (id uuid primary key default gen_random_uuid(), name text not null unique);
create table if not exists public.problem_topics (problem_id uuid not null references public.problems(id) on delete cascade, topic_id uuid not null references public.topics(id) on delete restrict, primary key (problem_id, topic_id));
create table if not exists public.problem_starter_code (
  id uuid primary key default gen_random_uuid(), problem_id uuid not null references public.problems(id) on delete cascade,
  language text not null check (language in ('cpp', 'java', 'python', 'javascript')), code text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(problem_id, language)
);
create index if not exists problems_title_idx on public.problems using gin (to_tsvector('simple', title));
create index if not exists problem_examples_problem_order_idx on public.problem_examples(problem_id, display_order);
create index if not exists problem_test_cases_problem_order_idx on public.problem_test_cases(problem_id, is_hidden, display_order);

-- Topic options only; no problems or test data are seeded.
insert into public.topics(name) values ('Array'),('String'),('Hash Table'),('Two Pointers'),('Sliding Window'),('Binary Search'),('Linked List'),('Stack'),('Queue'),('Tree'),('Binary Tree'),('BST'),('Graph'),('Heap'),('Greedy'),('Backtracking'),('Dynamic Programming') on conflict (name) do nothing;

create or replace function public.prepflow_admin_save_problem_v1(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; item jsonb; topic_value text; index_value integer := 0;
begin
  if coalesce(payload->>'id','') = '' then
    insert into problems(title, slug, difficulty, description, constraints, input_format, output_format)
    values (payload->>'title', payload->>'slug', payload->>'difficulty', payload->>'description', nullif(payload->>'constraints',''), nullif(payload->>'input_format',''), nullif(payload->>'output_format','')) returning id into pid;
  else
    pid := (payload->>'id')::uuid;
    update problems set title=payload->>'title', slug=payload->>'slug', difficulty=payload->>'difficulty', description=payload->>'description', constraints=nullif(payload->>'constraints',''), input_format=nullif(payload->>'input_format',''), output_format=nullif(payload->>'output_format',''), updated_at=now() where id=pid;
    if not found then raise exception 'Problem not found'; end if;
    delete from problem_examples where problem_id=pid; delete from problem_test_cases where problem_id=pid; delete from problem_topics where problem_id=pid; delete from problem_starter_code where problem_id=pid;
  end if;
  index_value := 0; for item in select * from jsonb_array_elements(coalesce(payload->'examples','[]'::jsonb)) loop
    insert into problem_examples(problem_id,input,output,explanation,display_order) values(pid,item->>'input',item->>'output',nullif(item->>'explanation',''),index_value); index_value := index_value + 1;
  end loop;
  index_value := 0; for item in select * from jsonb_array_elements(coalesce(payload->'test_cases','[]'::jsonb)) loop
    insert into problem_test_cases(problem_id,input,expected_output,is_hidden,display_order) values(pid,item->>'input',item->>'expected_output',coalesce((item->>'is_hidden')::boolean,false),index_value); index_value := index_value + 1;
  end loop;
  for topic_value in select * from jsonb_array_elements_text(coalesce(payload->'topic_ids','[]'::jsonb)) loop
    if not exists(select 1 from topics where id=topic_value::uuid) then raise exception 'Invalid topic'; end if;
    insert into problem_topics(problem_id,topic_id) values(pid,topic_value::uuid);
  end loop;
  for item in select * from jsonb_array_elements(coalesce(payload->'starter_code','[]'::jsonb)) loop
    insert into problem_starter_code(problem_id,language,code) values(pid,item->>'language',item->>'code');
  end loop;
  return pid;
end; $$;
