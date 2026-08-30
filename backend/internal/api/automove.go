package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/trpanel/backend/internal/state"
)

// listAutoMoveRules 获取自动文件管理规则列表
func (h *Handler) listAutoMoveRules(c *gin.Context) {
	st := h.state.Get()
	respond(c, gin.H{"rules": st.AutoMoveRules})
}

// saveAutoMoveRule 新增或更新规则
func (h *Handler) saveAutoMoveRule(c *gin.Context) {
	var rule state.AutoMoveRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		respondError(c, http.StatusBadRequest, "请求体无效: "+err.Error())
		return
	}
	if rule.TargetDir == "" {
		respondError(c, http.StatusBadRequest, "目标目录不能为空")
		return
	}
	if rule.ID == "" {
		rule.ID = newID("mv")
	}
	_ = h.state.Update(func(st *state.State) {
		replaced := false
		for i := range st.AutoMoveRules {
			if st.AutoMoveRules[i].ID == rule.ID {
				st.AutoMoveRules[i] = rule
				replaced = true
				break
			}
		}
		if !replaced {
			st.AutoMoveRules = append(st.AutoMoveRules, rule)
		}
	})
	respond(c, gin.H{"id": rule.ID})
}

// deleteAutoMoveRule 删除规则
func (h *Handler) deleteAutoMoveRule(c *gin.Context) {
	id := c.Param("id")
	var deleted bool
	_ = h.state.Update(func(st *state.State) {
		for i := range st.AutoMoveRules {
			if st.AutoMoveRules[i].ID == id {
				st.AutoMoveRules = append(st.AutoMoveRules[:i], st.AutoMoveRules[i+1:]...)
				deleted = true
				break
			}
		}
	})
	if !deleted {
		respondError(c, http.StatusBadRequest, "规则不存在")
		return
	}
	respond(c, gin.H{"deleted": true})
}

// runAutoMove 手动执行一轮自动文件管理
func (h *Handler) runAutoMove(c *gin.Context) {
	if err := h.automove.Tick(c.Request.Context()); err != nil {
		respondError(c, http.StatusBadGateway, "执行失败: "+err.Error())
		return
	}
	respond(c, gin.H{"run": true, "at": time.Now().Unix()})
}
