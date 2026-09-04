package torrentcreate

import (
	"bytes"
	"sort"
	"strconv"
)

// 极简 bencode 编码器：支持 int64 / string / []byte / []any / map[string]any。
// 字典键按字节序排序（Bencode 规范要求）。

func bencodeEncode(v any) []byte {
	var buf bytes.Buffer
	encodeValue(&buf, v)
	return buf.Bytes()
}

func encodeValue(buf *bytes.Buffer, v any) {
	switch x := v.(type) {
	case int64:
		buf.WriteByte('i')
		writeInt(buf, x)
		buf.WriteByte('e')
	case int:
		encodeValue(buf, int64(x))
	case string:
		encodeBytes(buf, []byte(x))
	case []byte:
		encodeBytes(buf, x)
	case []any:
		buf.WriteByte('l')
		for _, item := range x {
			encodeValue(buf, item)
		}
		buf.WriteByte('e')
	case []string:
		buf.WriteByte('l')
		for _, item := range x {
			encodeValue(buf, item)
		}
		buf.WriteByte('e')
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		buf.WriteByte('d')
		for _, k := range keys {
			encodeBytes(buf, []byte(k))
			encodeValue(buf, x[k])
		}
		buf.WriteByte('e')
	default:
		// 不支持的类型编码为空串，避免 panic（构造方均使用受控类型）
		encodeBytes(buf, nil)
	}
}

func encodeBytes(buf *bytes.Buffer, b []byte) {
	writeInt(buf, int64(len(b)))
	buf.WriteByte(':')
	buf.Write(b)
}

func writeInt(buf *bytes.Buffer, n int64) {
	buf.WriteString(strconv.FormatInt(n, 10))
}
