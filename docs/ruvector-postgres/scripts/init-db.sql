-- ============================================
-- RUVECTOR POSTGRESQL INITIALIZATION SCRIPT
-- ============================================
--
-- This script initializes the RuVector PostgreSQL extension
-- from ruvnet/ruvector with full V3 Claude-Flow integration.
--
-- RuVector provides 77+ SQL functions including:
-- - Vector similarity search (HNSW/IVFFlat)
-- - 39 Attention mechanisms
-- - GNN layers for graph operations
-- - Hyperbolic embeddings (Poincaré/Lorentz)
-- - Sparse vectors (BM25/TF-IDF)
-- - SPARQL support (50+ RDF functions)
-- - Local embeddings (6 fastembed models)
-- - Self-learning index optimization
--
-- Performance: ~61µs latency, 16,400 QPS

-- ============================================
-- PART 1: EXTENSION AND SCHEMA SETUP
-- ============================================

-- Enable RuVector extension (includes vector type)
CREATE EXTENSION IF NOT EXISTS ruvector;

-- Enable additional required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the claude_flow schema
CREATE SCHEMA IF NOT EXISTS claude_flow;

-- Grant permissions
GRANT ALL ON SCHEMA claude_flow TO claude;
GRANT USAGE ON SCHEMA ruvector TO claude;

-- Set search path for convenience
SET search_path TO claude_flow, ruvector, public;

-- ============================================
-- PART 2: CORE TABLES
-- ============================================

-- Embeddings table with RuVector vector type
CREATE TABLE IF NOT EXISTS claude_flow.embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding ruvector.vector(384),  -- RuVector vector type
    sparse_embedding ruvector.sparse_vector,  -- For hybrid BM25/TF-IDF search
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patterns table for learned patterns (ReasoningBank)
CREATE TABLE IF NOT EXISTS claude_flow.patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    embedding ruvector.vector(384),
    pattern_type VARCHAR(50),
    confidence FLOAT DEFAULT 0.5,
    success_count INT DEFAULT 0,
    failure_count INT DEFAULT 0,
    ewc_importance FLOAT DEFAULT 1.0,  -- EWC++ weight
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents table for multi-agent memory coordination
CREATE TABLE IF NOT EXISTS claude_flow.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(255) NOT NULL UNIQUE,
    agent_type VARCHAR(50),
    state JSONB DEFAULT '{}',
    memory_embedding ruvector.vector(384),
    last_active TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trajectories table for SONA reinforcement learning
CREATE TABLE IF NOT EXISTS claude_flow.trajectories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trajectory_id VARCHAR(255) NOT NULL UNIQUE,
    agent_type VARCHAR(50),
    task_description TEXT,
    status VARCHAR(20) DEFAULT 'in_progress',
    steps JSONB DEFAULT '[]',
    outcome VARCHAR(20),
    quality_score FLOAT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- Hyperbolic embeddings for hierarchical data
CREATE TABLE IF NOT EXISTS claude_flow.hyperbolic_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    euclidean_embedding ruvector.vector(384),
    poincare_embedding ruvector.vector(384),  -- Poincaré ball (||x|| < 1)
    lorentz_embedding ruvector.vector(385),   -- Lorentz model (+1 dim)
    curvature FLOAT DEFAULT -1.0,
    hierarchy_level INT DEFAULT 0,
    parent_id UUID REFERENCES claude_flow.hyperbolic_embeddings(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Graph nodes for GNN operations
CREATE TABLE IF NOT EXISTS claude_flow.graph_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(255) NOT NULL UNIQUE,
    node_type VARCHAR(50),
    embedding ruvector.vector(384),
    features JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Graph edges for GNN message passing
CREATE TABLE IF NOT EXISTS claude_flow.graph_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES claude_flow.graph_nodes(id),
    target_id UUID REFERENCES claude_flow.graph_nodes(id),
    edge_type VARCHAR(50),
    weight FLOAT DEFAULT 1.0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PART 3: RUVECTOR INDICES (HNSW + IVFFlat)
-- ============================================

-- HNSW index for embeddings (~61µs search latency)
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
ON claude_flow.embeddings
USING ruvector_hnsw (embedding ruvector.cosine_ops)
WITH (m = 16, ef_construction = 100);

-- HNSW index for patterns
CREATE INDEX IF NOT EXISTS idx_patterns_hnsw
ON claude_flow.patterns
USING ruvector_hnsw (embedding ruvector.cosine_ops)
WITH (m = 16, ef_construction = 100);

-- HNSW index for agent memory
CREATE INDEX IF NOT EXISTS idx_agents_hnsw
ON claude_flow.agents
USING ruvector_hnsw (memory_embedding ruvector.cosine_ops)
WITH (m = 16, ef_construction = 64);

-- HNSW index for hyperbolic embeddings
CREATE INDEX IF NOT EXISTS idx_hyperbolic_hnsw
ON claude_flow.hyperbolic_embeddings
USING ruvector_hnsw (euclidean_embedding ruvector.cosine_ops)
WITH (m = 16, ef_construction = 100);

-- HNSW index for graph nodes
CREATE INDEX IF NOT EXISTS idx_graph_nodes_hnsw
ON claude_flow.graph_nodes
USING ruvector_hnsw (embedding ruvector.cosine_ops)
WITH (m = 16, ef_construction = 64);

-- IVFFlat index for memory-efficient search (optional)
-- CREATE INDEX IF NOT EXISTS idx_embeddings_ivfflat
-- ON claude_flow.embeddings
-- USING ruvector_ivfflat (embedding ruvector.cosine_ops)
-- WITH (lists = 100);

-- ============================================
-- PART 4: RUVECTOR CORE FUNCTIONS
-- ============================================

-- Semantic similarity search using RuVector
CREATE OR REPLACE FUNCTION claude_flow.search_similar(
    query_embedding ruvector.vector(384),
    limit_count INT DEFAULT 10,
    min_similarity FLOAT DEFAULT 0.5
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    similarity FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.content,
        ruvector.cosine_similarity(e.embedding, query_embedding)::FLOAT AS similarity,
        e.metadata
    FROM claude_flow.embeddings e
    WHERE e.embedding IS NOT NULL
      AND ruvector.cosine_similarity(e.embedding, query_embedding) >= min_similarity
    ORDER BY e.embedding <-> query_embedding  -- RuVector distance operator
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Hybrid search (vector + BM25 sparse)
CREATE OR REPLACE FUNCTION claude_flow.hybrid_search(
    query_embedding ruvector.vector(384),
    query_text TEXT,
    limit_count INT DEFAULT 10,
    vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    vector_score FLOAT,
    sparse_score FLOAT,
    combined_score FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.content,
        ruvector.cosine_similarity(e.embedding, query_embedding)::FLOAT AS v_score,
        COALESCE(ruvector.bm25_score(e.sparse_embedding, query_text), 0)::FLOAT AS s_score,
        (
            vector_weight * ruvector.cosine_similarity(e.embedding, query_embedding) +
            (1 - vector_weight) * COALESCE(ruvector.bm25_score(e.sparse_embedding, query_text), 0)
        )::FLOAT AS c_score,
        e.metadata
    FROM claude_flow.embeddings e
    WHERE e.embedding IS NOT NULL
    ORDER BY c_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- PART 5: ATTENTION MECHANISM FUNCTIONS
-- ============================================

-- Self-attention using RuVector's attention functions
CREATE OR REPLACE FUNCTION claude_flow.self_attention(
    source_ids UUID[],
    temperature FLOAT DEFAULT 1.0
)
RETURNS TABLE (
    source_id UUID,
    target_id UUID,
    attention_weight FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH sources AS (
        SELECT id, embedding
        FROM claude_flow.embeddings
        WHERE id = ANY(source_ids)
          AND embedding IS NOT NULL
    )
    SELECT
        s1.id AS source_id,
        s2.id AS target_id,
        ruvector.softmax_attention(s1.embedding, s2.embedding, temperature)::FLOAT AS attention_weight
    FROM sources s1
    CROSS JOIN sources s2;
END;
$$ LANGUAGE plpgsql STABLE;

-- Multi-head attention
CREATE OR REPLACE FUNCTION claude_flow.multihead_attention(
    query_embedding ruvector.vector(384),
    num_heads INT DEFAULT 8,
    limit_count INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    head_attentions FLOAT[],
    aggregated_attention FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.content,
        ruvector.multihead_attention_scores(query_embedding, e.embedding, num_heads)::FLOAT[] AS head_scores,
        ruvector.multihead_attention_aggregate(query_embedding, e.embedding, num_heads)::FLOAT AS agg_score,
        e.metadata
    FROM claude_flow.embeddings e
    WHERE e.embedding IS NOT NULL
    ORDER BY agg_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Cross-attention between query and key-value sets
CREATE OR REPLACE FUNCTION claude_flow.cross_attention(
    query_ids UUID[],
    kv_filter JSONB DEFAULT NULL,
    temperature FLOAT DEFAULT 1.0
)
RETURNS TABLE (
    query_id UUID,
    kv_id UUID,
    attention_weight FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH queries AS (
        SELECT id, embedding
        FROM claude_flow.embeddings
        WHERE id = ANY(query_ids) AND embedding IS NOT NULL
    ),
    kv AS (
        SELECT id, embedding
        FROM claude_flow.embeddings
        WHERE embedding IS NOT NULL
          AND id != ALL(query_ids)
          AND (kv_filter IS NULL OR metadata @> kv_filter)
    )
    SELECT
        q.id AS query_id,
        kv.id AS kv_id,
        ruvector.cross_attention_score(q.embedding, kv.embedding, temperature)::FLOAT AS attention_weight
    FROM queries q
    CROSS JOIN kv;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- PART 6: GNN OPERATIONS
-- ============================================

-- Message passing for GNN
CREATE OR REPLACE FUNCTION claude_flow.gnn_message_pass(
    node_id VARCHAR(255),
    aggregation TEXT DEFAULT 'mean'  -- 'mean', 'sum', 'max'
)
RETURNS ruvector.vector(384) AS $$
DECLARE
    v_result ruvector.vector(384);
    v_node_uuid UUID;
BEGIN
    -- Get node UUID
    SELECT id INTO v_node_uuid
    FROM claude_flow.graph_nodes
    WHERE graph_nodes.node_id = gnn_message_pass.node_id;

    -- Aggregate neighbor embeddings using RuVector GNN functions
    SELECT ruvector.gnn_aggregate(
        ARRAY_AGG(n.embedding),
        aggregation
    )
    INTO v_result
    FROM claude_flow.graph_edges e
    JOIN claude_flow.graph_nodes n ON n.id = e.target_id
    WHERE e.source_id = v_node_uuid;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Graph attention network (GAT) scoring
CREATE OR REPLACE FUNCTION claude_flow.gat_attention(
    source_node VARCHAR(255),
    limit_count INT DEFAULT 10
)
RETURNS TABLE (
    neighbor_id VARCHAR(255),
    attention_weight FLOAT,
    edge_type VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    WITH source AS (
        SELECT id, embedding
        FROM claude_flow.graph_nodes
        WHERE node_id = source_node
    )
    SELECT
        n.node_id AS neighbor_id,
        ruvector.gat_score(s.embedding, n.embedding)::FLOAT AS attention_weight,
        e.edge_type
    FROM source s
    JOIN claude_flow.graph_edges e ON e.source_id = s.id
    JOIN claude_flow.graph_nodes n ON n.id = e.target_id
    ORDER BY attention_weight DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- PART 7: HYPERBOLIC OPERATIONS
-- ============================================

-- Convert Euclidean to Poincaré embedding
CREATE OR REPLACE FUNCTION claude_flow.to_poincare(
    euclidean ruvector.vector(384),
    curvature FLOAT DEFAULT -1.0
)
RETURNS ruvector.vector(384) AS $$
BEGIN
    RETURN ruvector.exp_map_poincare(euclidean, curvature);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Poincaré distance (geodesic)
CREATE OR REPLACE FUNCTION claude_flow.poincare_distance(
    x ruvector.vector(384),
    y ruvector.vector(384),
    curvature FLOAT DEFAULT -1.0
)
RETURNS FLOAT AS $$
BEGIN
    RETURN ruvector.hyperbolic_distance(x, y, 'poincare', curvature);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Hyperbolic midpoint (Möbius addition)
CREATE OR REPLACE FUNCTION claude_flow.poincare_midpoint(
    x ruvector.vector(384),
    y ruvector.vector(384),
    curvature FLOAT DEFAULT -1.0
)
RETURNS ruvector.vector(384) AS $$
BEGIN
    RETURN ruvector.mobius_add(x, y, curvature);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Hierarchical search in hyperbolic space
CREATE OR REPLACE FUNCTION claude_flow.hyperbolic_search(
    query ruvector.vector(384),
    limit_count INT DEFAULT 10,
    curvature FLOAT DEFAULT -1.0
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    euclidean_dist FLOAT,
    hyperbolic_dist FLOAT,
    hierarchy_level INT,
    metadata JSONB
) AS $$
DECLARE
    v_query_poincare ruvector.vector(384);
BEGIN
    v_query_poincare := ruvector.exp_map_poincare(query, curvature);

    RETURN QUERY
    SELECT
        he.id,
        he.content,
        (he.euclidean_embedding <-> query)::FLOAT AS euc_dist,
        ruvector.hyperbolic_distance(he.poincare_embedding, v_query_poincare, 'poincare', curvature)::FLOAT AS hyp_dist,
        he.hierarchy_level,
        he.metadata
    FROM claude_flow.hyperbolic_embeddings he
    WHERE he.euclidean_embedding IS NOT NULL
    ORDER BY hyp_dist
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- PART 8: LOCAL EMBEDDING GENERATION
-- ============================================

-- Generate embedding using RuVector's local fastembed models
CREATE OR REPLACE FUNCTION claude_flow.embed_text(
    text_content TEXT,
    model_name TEXT DEFAULT 'all-MiniLM-L6-v2'
)
RETURNS ruvector.vector(384) AS $$
BEGIN
    RETURN ruvector.fastembed(text_content, model_name);
END;
$$ LANGUAGE plpgsql STABLE;

-- Batch embed multiple texts
CREATE OR REPLACE FUNCTION claude_flow.embed_texts_batch(
    texts TEXT[],
    model_name TEXT DEFAULT 'all-MiniLM-L6-v2'
)
RETURNS TABLE (
    idx INT,
    embedding ruvector.vector(384)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ordinality::INT AS idx,
        ruvector.fastembed(t, model_name) AS embedding
    FROM unnest(texts) WITH ORDINALITY AS t;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- PART 9: SELF-LEARNING INDEX OPTIMIZATION
-- ============================================

-- Trigger self-learning optimization
CREATE OR REPLACE FUNCTION claude_flow.optimize_indices()
RETURNS void AS $$
BEGIN
    -- RuVector self-learning index optimization
    PERFORM ruvector.learn_optimize('claude_flow.embeddings', 'embedding');
    PERFORM ruvector.learn_optimize('claude_flow.patterns', 'embedding');
    PERFORM ruvector.learn_optimize('claude_flow.agents', 'memory_embedding');
END;
$$ LANGUAGE plpgsql;

-- Schedule periodic optimization (every hour)
-- Note: Requires pg_cron extension or external scheduler
-- SELECT cron.schedule('ruvector-optimize', '0 * * * *', 'SELECT claude_flow.optimize_indices()');

-- ============================================
-- PART 10: SAMPLE DATA
-- ============================================

-- Insert sample embeddings for testing
INSERT INTO claude_flow.embeddings (content, metadata) VALUES
    ('Implementing JWT authentication with refresh token rotation',
     '{"category": "security", "language": "typescript", "agent": "security-architect"}'),
    ('Building a RESTful API with Express and TypeScript',
     '{"category": "backend", "language": "typescript", "agent": "coder"}'),
    ('Setting up RuVector PostgreSQL for semantic search',
     '{"category": "database", "language": "sql", "agent": "architect"}'),
    ('HNSW indexing for sub-millisecond vector search',
     '{"category": "performance", "language": "sql", "agent": "perf-engineer"}'),
    ('TDD London School approach with mocks',
     '{"category": "testing", "language": "typescript", "agent": "tester"}'),
    ('Multi-head attention mechanism in transformer architectures',
     '{"category": "ai", "language": "python", "agent": "ml-developer"}'),
    ('Graph neural networks for knowledge representation',
     '{"category": "ai", "language": "python", "agent": "ml-developer"}'),
    ('Hyperbolic embeddings for hierarchical data',
     '{"category": "ai", "language": "python", "agent": "researcher"}'),
    ('BM25 ranking for hybrid search optimization',
     '{"category": "search", "language": "sql", "agent": "perf-engineer"}'),
    ('Multi-agent swarm coordination patterns',
     '{"category": "ai", "language": "typescript", "agent": "architect"}')
ON CONFLICT DO NOTHING;

-- Insert sample agents
INSERT INTO claude_flow.agents (agent_id, agent_type, state) VALUES
    ('coder-001', 'coder', '{"specializations": ["typescript", "react"], "tasks_completed": 42}'),
    ('architect-001', 'architect', '{"specializations": ["system-design", "ddd"], "tasks_completed": 28}'),
    ('tester-001', 'tester', '{"specializations": ["tdd", "integration"], "tasks_completed": 35}'),
    ('security-001', 'security-architect', '{"specializations": ["auth", "crypto"], "tasks_completed": 15}'),
    ('perf-001', 'perf-engineer', '{"specializations": ["database", "caching"], "tasks_completed": 22}')
ON CONFLICT (agent_id) DO UPDATE SET last_active = NOW();

-- Insert sample patterns
INSERT INTO claude_flow.patterns (name, pattern_type, description, confidence) VALUES
    ('jwt-refresh-rotation', 'security', 'JWT with secure refresh token rotation', 0.92),
    ('hnsw-search-pattern', 'performance', 'HNSW index for vector similarity search', 0.95),
    ('tdd-london-mocks', 'testing', 'London School TDD with mocks first', 0.85),
    ('hierarchical-swarm', 'coordination', 'Anti-drift hierarchical swarm topology', 0.90),
    ('gnn-message-passing', 'ai', 'GNN message aggregation pattern', 0.88)
ON CONFLICT DO NOTHING;

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'RuVector PostgreSQL Initialization Complete!';
    RAISE NOTICE '============================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Extension: ruvector (77+ SQL functions)';
    RAISE NOTICE 'Schema: claude_flow';
    RAISE NOTICE 'Tables: embeddings, patterns, agents, trajectories, hyperbolic_embeddings, graph_nodes, graph_edges';
    RAISE NOTICE 'Indices: 5 HNSW indices created';
    RAISE NOTICE '';
    RAISE NOTICE 'Features enabled:';
    RAISE NOTICE '  - HNSW/IVFFlat vector indexing';
    RAISE NOTICE '  - 39 Attention mechanisms';
    RAISE NOTICE '  - GNN operations';
    RAISE NOTICE '  - Hyperbolic embeddings (Poincare/Lorentz)';
    RAISE NOTICE '  - Sparse vectors (BM25/TF-IDF)';
    RAISE NOTICE '  - Local embeddings (fastembed)';
    RAISE NOTICE '  - Self-learning optimization';
    RAISE NOTICE '';
    RAISE NOTICE 'Performance: ~61us latency, 16,400 QPS';
    RAISE NOTICE '';
END $$;
