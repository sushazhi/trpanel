package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/transmission-manager/backend/internal/state"
)

// listRSSFeeds 获取 RSS 源列表
func (h *Handler) listRSSFeeds(c *gin.Context) {
	st := h.state.Get()
	respond(c, gin.H{"feeds": st.RSSFeeds})
}

// saveRSSFeed 新增或更新 RSS 源（带 ID 视为更新）
func (h *Handler) saveRSSFeed(c *gin.Context) {
	var feed state.RSSFeed
	if err := c.ShouldBindJSON(&feed); err != nil {
		respondError(c, http.StatusBadRequest, "请求体无效: "+err.Error())
		return
	}
	if feed.URL == "" {
		respondError(c, http.StatusBadRequest, "RSS 地址不能为空")
		return
	}
	if feed.Name == "" {
		feed.Name = feed.URL
	}
	if feed.ID == "" {
		feed.ID = newID("rss")
	}
	_ = h.state.Update(func(st *state.State) {
		replaced := false
		for i := range st.RSSFeeds {
			if st.RSSFeeds[i].ID == feed.ID {
				old := st.RSSFeeds[i]
				// 保留运行时字段
				feed.LastFetchAt = old.LastFetchAt
				feed.LastError = old.LastError
				feed.Processed = old.Processed
				st.RSSFeeds[i] = feed
				replaced = true
				break
			}
		}
		if !replaced {
			st.RSSFeeds = append(st.RSSFeeds, feed)
		}
	})
	respond(c, gin.H{"id": feed.ID})
}

// deleteRSSFeed 删除 RSS 源
func (h *Handler) deleteRSSFeed(c *gin.Context) {
	id := c.Param("id")
	var deleted bool
	err := h.state.Update(func(st *state.State) {
		for i := range st.RSSFeeds {
			if st.RSSFeeds[i].ID == id {
				st.RSSFeeds = append(st.RSSFeeds[:i], st.RSSFeeds[i+1:]...)
				// 清理该源的全部已处理记录（键由 state.RSSKey 构造，前缀自带分隔符，
				// 不会误删以该 id 为前缀的其它源的记录）
				prefix := state.RSSKey(id, "")
				for k := range st.ProcessedRSS {
					if strings.HasPrefix(k, prefix) {
						delete(st.ProcessedRSS, k)
					}
				}
				deleted = true
				break
			}
		}
	})
	if !deleted {
		respondError(c, http.StatusBadRequest, "RSS 源不存在")
		return
	}
	if err != nil {
		respondError(c, http.StatusInternalServerError, "删除已生效但保存状态失败: "+err.Error())
		return
	}
	respond(c, gin.H{"deleted": true})
}

// fetchRSS 手动触发抓取指定源
func (h *Handler) fetchRSS(c *gin.Context) {
	id := c.Param("id")
	if err := h.rss.Fetch(c.Request.Context(), id); err != nil {
		respondError(c, http.StatusBadGateway, "抓取失败: "+err.Error())
		return
	}
	st := h.state.Get()
	var f *state.RSSFeed
	for i := range st.RSSFeeds {
		if st.RSSFeeds[i].ID == id {
			f = &st.RSSFeeds[i]
			break
		}
	}
	if f == nil {
		respondError(c, http.StatusBadRequest, "RSS 源不存在")
		return
	}
	respond(c, gin.H{"id": id, "lastFetchAt": f.LastFetchAt, "lastError": f.LastError, "processed": f.Processed})
}
